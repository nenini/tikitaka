"""BE 전달 페이로드 검증 (S15P11A307-494).

BE가 준 계약 예시와 필드·타입이 어긋나면 연동 당일에 터진다. 계약의 '반드시' 조항을
그대로 테스트로 옮겼다.
"""

from __future__ import annotations

from itertools import count

from aggregator.report.builder import ReportNarrative
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput
from aggregator.report.schema import (
    ANALYSIS_VERSION,
    REPORT_VERSION,
    analysis_failure_payload,
    analysis_idempotency_key,
    build_analysis_payload,
    build_report_payload,
    report_failure_payload,
    report_idempotency_key,
)
from aggregator.report.scoring import score_report
from aggregator.state import Utterance

A = "user-a"
B = "user-b"
IDS = {A: 1001, B: 1002}
AT = "2026-08-03T17:00:00+09:00"

_SEQ = count(1)


def _u(speaker: str, start_ms: int, end_ms: int, text: str = "발화") -> Utterance:
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="s1",
        user_id=speaker,
        participant_identity=f"identity-{speaker}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at=AT,
    )


def _report(*, vision: bool = True) -> ReportInput:
    mine = (_u(A, 0, 10_000), _u(A, 40_000, 50_000))
    yours = (_u(B, 12_000, 20_000),)
    return ReportInput(
        session_id="s1",
        session_duration_ms=24 * 60 * 1000,
        speakers=(
            SpeakerInput(A, mine, sum(u.duration_ms for u in mine), 0, 32),
            SpeakerInput(B, yours, sum(u.duration_ms for u in yours), 0, 13),
        ),
        vision=(
            VisionInput(A, vision, {"SMILE_STARTED": 7, "GAZE_AWAY_STARTED": 9,
                                    "FACE_MISSING_STARTED": 1}, 1.0 if vision else 0.0),
            VisionInput(B, vision, {}, 1.0 if vision else 0.0),
        ),
        vision_enabled=vision,
    )


def _analysis(*, vision: bool = True) -> dict[str, object]:
    report = _report(vision=vision)
    return build_analysis_payload(
        report, score_report(report), session_id=12345, user_ids=IDS, analyzed_at=AT
    )


def _first(payload: dict[str, object]) -> dict[str, object]:
    participants = payload["participants"]
    assert isinstance(participants, list)
    first = participants[0]
    assert isinstance(first, dict)
    return first


# ── ① analyses ───────────────────────────────────────────────────────
def test_analysis_top_level_fields() -> None:
    payload = _analysis()
    assert payload["schemaVersion"] == 1
    assert payload["analysisVersion"] == ANALYSIS_VERSION
    assert payload["sessionId"] == 12345
    assert payload["analyzedAt"] == AT


def test_analysis_covers_every_participant() -> None:
    participants = _analysis()["participants"]
    assert isinstance(participants, list)
    assert {p["userId"] for p in participants} == {1001, 1002}


def test_all_six_axis_keys_use_be_names() -> None:
    axes = _first(_analysis())["axes"]
    assert isinstance(axes, dict)
    assert set(axes) == {"flow", "question", "listening", "reaction", "balance", "nonverbal"}


def test_unmeasured_axis_nulls_score_raw_and_unit() -> None:
    """계약: measured=false이면 score와 raw는 반드시 null."""
    axes = _first(_analysis())["axes"]
    assert isinstance(axes, dict)
    question = axes["question"]
    assert isinstance(question, dict)
    assert question["measured"] is False
    assert question["score"] is None
    assert question["raw"] is None
    assert question["rawUnit"] is None
    assert question["note"]  # 이유는 남긴다


def test_balance_uses_ratio_unit_others_use_per_30min() -> None:
    axes = _first(_analysis())["axes"]
    assert isinstance(axes, dict)
    assert axes["balance"]["rawUnit"] == "RATIO"
    for key in ("flow", "listening", "reaction", "nonverbal"):
        assert axes[key]["rawUnit"] == "COUNT_PER_30_MINUTES"


def test_raw_is_the_30min_normalized_value_not_the_count() -> None:
    """`rawUnit=COUNT_PER_30_MINUTES`라 raw는 환산값이다.

    실제 횟수는 metrics에 따로 있다. 24분 세션이면 두 값이 다르다 — BE 예시가 30분이라
    같아 보였을 뿐이다.
    """
    first = _first(_analysis())
    axes, metrics = first["axes"], first["metrics"]
    assert isinstance(axes, dict) and isinstance(metrics, dict)
    raw = axes["flow"]["raw"]
    assert isinstance(raw, float)
    assert raw != metrics["longSilenceCount"]  # 24분 세션이므로 달라야 한다


def test_vision_counts_null_when_unmeasured() -> None:
    """계약: visionMeasured=false이면 비전 관련 횟수도 null."""
    metrics = _first(_analysis(vision=False))["metrics"]
    assert isinstance(metrics, dict)
    assert metrics["visionMeasured"] is False
    assert metrics["smileEpisodeCount"] is None
    assert metrics["gazeAwayCount"] is None
    assert metrics["faceMissingCount"] is None


def test_question_count_is_always_null() -> None:
    metrics = _first(_analysis())["metrics"]
    assert isinstance(metrics, dict)
    assert metrics["questionCount"] is None


def test_silence_threshold_is_reported() -> None:
    """어떤 기준으로 센 횟수인지 BE가 알아야 한다."""
    metrics = _first(_analysis())["metrics"]
    assert isinstance(metrics, dict)
    assert metrics["silenceThresholdMs"] == 10_000


def test_evidence_segments_have_required_fields() -> None:
    segments = _first(_analysis())["evidenceSegments"]
    assert isinstance(segments, list)
    assert segments, "침묵 20초가 있으므로 최소 1건은 나와야 한다"
    for segment in segments:
        assert isinstance(segment, dict)
        assert set(segment) == {"evidenceId", "eventType", "startMs", "endMs", "description"}
        assert segment["eventType"] in {"LONG_SILENCE", "INTERRUPTION", "BACKCHANNEL"}
        assert isinstance(segment["startMs"], int)
        assert isinstance(segment["endMs"], int)
        assert segment["endMs"] >= segment["startMs"]


def test_evidence_segments_sorted_by_time() -> None:
    """화면 타임라인에 순서대로 찍어야 한다."""
    segments = _first(_analysis())["evidenceSegments"]
    assert isinstance(segments, list)
    starts = [s["startMs"] for s in segments]
    assert starts == sorted(starts)


def test_evidence_ids_unique_within_participant() -> None:
    segments = _first(_analysis())["evidenceSegments"]
    assert isinstance(segments, list)
    ids = [s["evidenceId"] for s in segments]
    assert len(ids) == len(set(ids))


def test_silence_segment_matches_the_gap() -> None:
    """_report()는 10초~40초 사이가 30초 공백이다."""
    segments = _first(_analysis())["evidenceSegments"]
    assert isinstance(segments, list)
    silences = [s for s in segments if s["eventType"] == "LONG_SILENCE"]
    assert (silences[0]["startMs"], silences[0]["endMs"]) == (20_000, 40_000)


def test_coverage_is_a_ratio_block() -> None:
    """계약 2026-08-04: 비율은 0~1, 측정 불가는 0이 아니라 null."""
    metrics = _first(_analysis())["metrics"]
    assert isinstance(metrics, dict)
    coverage = metrics["coverage"]
    assert isinstance(coverage, dict)
    assert set(coverage) == {"faceDetectionRate", "speechRecognitionRate", "cameraUptimeRate"}
    for value in coverage.values():
        assert value is None or 0.0 <= value <= 1.0


def test_speech_recognition_rate_is_null_until_stt_reports_drops() -> None:
    """신뢰도 미달로 버려진 발화 수를 SessionState가 모른다 — 0이 아니라 null."""
    metrics = _first(_analysis())["metrics"]
    assert isinstance(metrics, dict)
    assert metrics["coverage"]["speechRecognitionRate"] is None


def test_filler_breakdown_is_sent() -> None:
    """#140 필러워드 분석 화면에 단어별 횟수가 필요하다."""
    metrics = _first(_analysis())["metrics"]
    assert isinstance(metrics, dict)
    assert isinstance(metrics["fillerBreakdown"], dict)


def test_cards_are_not_sent() -> None:
    """근거 카드는 이번 계약에서 보류 — 인용·유형코드도 함께 빠진다."""
    serialized = repr(_analysis())
    for absent in ("cards", "quote", "patternCode", "severity", "suggestion"):
        assert absent not in serialized


def test_analysis_failure_payload_marks_every_user() -> None:
    payload = analysis_failure_payload(
        session_id=12345, user_ids=[1001, 1002], analyzed_at=AT
    )
    participants = payload["participants"]
    assert isinstance(participants, list)
    assert all(p["analysisStatus"] == "FAILED" for p in participants)


# ── ② reports/results ────────────────────────────────────────────────
def _narrative(*, by_llm: bool = True) -> ReportNarrative:
    return ReportNarrative(
        summary="편안하게 대화가 이어졌어요.",
        strengths=("되묻기가 자연스러웠어요",),
        improvements=("한 주제에 오래 머물렀어요",),
        missions=("한 번 더 되묻기",),
        cards=(),
        generated_by_llm=by_llm,
    )


def _report_payload(*, by_llm: bool = True) -> dict[str, object]:
    reports = build_report_payload(
        [(1001, _narrative(by_llm=by_llm))], session_id=12345, generated_at=AT
    )["reports"]
    assert isinstance(reports, list)
    first = reports[0]
    assert isinstance(first, dict)
    return first


def test_llm_success_is_completed_and_llm_mode() -> None:
    entry = _report_payload()
    assert entry["reportStatus"] == "COMPLETED"
    assert entry["generationMode"] == "LLM"
    assert entry["failureCode"] is None


def test_llm_fallback_is_fallback_and_rule_based() -> None:
    entry = _report_payload(by_llm=False)
    assert entry["reportStatus"] == "FALLBACK"
    assert entry["generationMode"] == "RULE_BASED"


def test_report_payload_omits_cards() -> None:
    assert "cards" not in _report_payload()


def test_report_failure_payload_shape() -> None:
    """계약: FAILED는 빈 배열 + 실패 사유를 담아 반드시 보낸다."""
    payload = report_failure_payload(
        session_id=12345, user_ids=[1001], generated_at=AT,
        failure_code="NO_UTTERANCE", failure_reason="발화가 없어 리포트를 만들지 못했습니다.",
    )
    reports = payload["reports"]
    assert isinstance(reports, list)
    entry = reports[0]
    assert isinstance(entry, dict)
    assert entry["reportStatus"] == "FAILED"
    assert entry["generationMode"] == "NONE"
    assert entry["summaryText"] is None
    assert entry["strengths"] == []
    assert entry["failureCode"] == "NO_UTTERANCE"


def test_report_versions_present() -> None:
    payload = build_report_payload(
        [(1001, _narrative())], session_id=12345, generated_at=AT
    )
    assert payload["analysisVersion"] == ANALYSIS_VERSION
    assert payload["reportVersion"] == REPORT_VERSION


# ── 멱등키 ───────────────────────────────────────────────────────────
def test_analysis_key_has_no_user() -> None:
    assert analysis_idempotency_key(12345) == "session-12345-analysis-v1.0.0"


def test_report_key_is_per_session() -> None:
    """계약 2026-08-04: 리포트는 세션당 한 번 전송이라 키에 userId를 넣지 않는다."""
    assert report_idempotency_key(12345) == "session-12345-report-v1.0.0"


def test_keys_keep_full_version() -> None:
    """patch가 달라지면 키도 달라져야 한다.

    BE는 `sessionId + 전체 버전 문자열`로 중복을 판정하고, 계산 로직을 고쳐 patch를
    올린 재분석은 새 결과로 저장한다. 키를 메이저까지만 줄이면 patch가 달라도 같은
    키가 나와 BE 규칙과 어긋난 값을 보내게 된다.
    """
    assert analysis_idempotency_key(1, "analysis-v1.0.1") != analysis_idempotency_key(
        1, "analysis-v1.0.0"
    )
    assert report_idempotency_key(1, "report-v1.2.0") == "session-1-report-v1.2.0"


def test_report_payload_holds_every_participant() -> None:
    """유저별 POST가 아니라 배열에 참가자 전원을 담는다."""
    payload = build_report_payload(
        [(1001, _narrative()), (1002, _narrative())], session_id=12345, generated_at=AT
    )
    reports = payload["reports"]
    assert isinstance(reports, list)
    assert [r["userId"] for r in reports] == [1001, 1002]


def test_failure_payload_sends_null_not_empty_objects() -> None:
    """FAILED이면 axes·metrics는 **null**이어야 한다.

    `{}`를 보내면 BE가 전 필드 null인 MetricsRequest로 역직렬화하고 @Valid 캐스케이드가
    @NotNull 6건을 한꺼번에 터뜨려 400이 된다. 4xx는 재시도도 안 되므로 실패 통지가
    영구 유실되고 BE는 분석 대기 상태로 남는다.
    """
    payload = analysis_failure_payload(
        session_id=1, user_ids=[1001], analyzed_at=AT
    )
    participant = payload["participants"][0]  # type: ignore[index]
    assert participant["axes"] is None
    assert participant["metrics"] is None
    assert participant["evidenceSegments"] == []
