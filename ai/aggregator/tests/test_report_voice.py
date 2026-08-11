"""AI 화상 세션 리포트 검증 (AIVIDEO-04).

핵심은 "5분 세션에서 믿을 수 있는 숫자만 내는가"다. 특히 평균 응답 시간은
AI 세션에서만 정확한 지표라 계산 규칙(끼어든 턴 제외)이 정확해야 한다.
"""

from __future__ import annotations

from itertools import count

from aggregator.report.voice import (
    AiTurn,
    build_voice_analysis_payload,
    build_voice_narrative,
    build_voice_report_payload,
    compute_voice_metrics,
)
from aggregator.transcripts import TranscriptSegment

_SEQ = count(1)
AT = "2026-08-05T14:00:00+09:00"


def _u(start_ms: int, end_ms: int, text: str = "네 그렇죠") -> TranscriptSegment:
    seq = next(_SEQ)
    return TranscriptSegment(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="99",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="client-1",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at=AT,
    )


# ── 지표 ─────────────────────────────────────────────────────────────
def test_speaking_time_and_mean_length() -> None:
    metrics = compute_voice_metrics(
        utterances=(_u(0, 4_000), _u(10_000, 16_000)), turns=()
    )
    assert metrics.speaking_ms == 10_000
    assert metrics.utterance_count == 2
    assert metrics.mean_utterance_ms == 5_000


def test_mean_response_time_measures_gap_after_ai_turn() -> None:
    """AI가 말 끝낸 시각은 우리가 만든 값이라 정확하다 — 이게 이 리포트의 강점."""
    turns = (AiTurn(1, "안녕하세요", 0, 3_000), AiTurn(2, "그래요?", 20_000, 22_000))
    metrics = compute_voice_metrics(
        utterances=(_u(5_000, 8_000), _u(24_500, 26_000)), turns=turns
    )
    # 3s→5s = 2000ms, 22s→24.5s = 2500ms
    assert metrics.mean_response_ms == 2_250
    assert metrics.response_sample_count == 2


def test_interrupted_turn_is_excluded_from_response_time() -> None:
    """끼어든 건 망설임이 아니다. 넣으면 평균이 0에 눌린다."""
    turns = (AiTurn(1, "제가 요즘", 0, 2_000, interrupted=True), AiTurn(2, "아 네", 10_000, 11_000))
    metrics = compute_voice_metrics(
        utterances=(_u(1_500, 3_000), _u(14_000, 15_000)), turns=turns
    )
    assert metrics.response_sample_count == 1
    assert metrics.mean_response_ms == 3_000
    assert metrics.barge_in_count == 1


def test_no_ai_turn_leaves_response_time_null() -> None:
    """측정 불가는 0이 아니라 null이다(리포트 규약)."""
    metrics = compute_voice_metrics(utterances=(_u(0, 3_000),), turns=())
    assert metrics.mean_response_ms is None
    assert metrics.response_sample_count == 0


def test_silence_after_last_ai_turn_is_not_counted() -> None:
    """AI가 마지막에 말하고 사용자가 대답 없이 세션이 끝난 경우."""
    metrics = compute_voice_metrics(
        utterances=(_u(0, 2_000),), turns=(AiTurn(1, "그럼요", 10_000, 12_000),)
    )
    assert metrics.mean_response_ms is None


def test_empty_session_does_not_divide_by_zero() -> None:
    metrics = compute_voice_metrics(utterances=(), turns=())
    assert metrics.speaking_ms == 0
    assert metrics.mean_utterance_ms is None
    assert metrics.mean_response_ms is None


# ── 페이로드 ─────────────────────────────────────────────────────────
def test_analysis_payload_shape() -> None:
    metrics = compute_voice_metrics(
        utterances=(_u(0, 4_000),),
        turns=(AiTurn(1, "네", 5_000, 6_000),),
        filler_count=3,
        filler_breakdown={"뭐": 2, "음": 1},
    )
    payload = build_voice_analysis_payload(
        metrics, session_id=99, user_id=1001, session_duration_ms=300_000, analyzed_at=AT
    )
    assert payload["schemaVersion"] == 1
    assert payload["analysisVersion"] == "voice-analysis-v1.0.0"
    assert payload["sessionDurationMs"] == 300_000
    m = payload["metrics"]
    assert isinstance(m, dict)
    assert set(m) == {
        "speakingMs", "utteranceCount", "meanUtteranceMs", "meanResponseMs",
        "responseSampleCount", "fillerCount", "fillerBreakdown", "aiTurnCount",
        "unansweredTurnCount", "bargeInCount",
    }
    assert m["fillerBreakdown"] == {"뭐": 2, "음": 1}


def test_six_axis_fields_are_absent() -> None:
    """6축을 재사용하지 않는다 — 5분엔 환산 지표의 표본이 없다."""
    metrics = compute_voice_metrics(utterances=(_u(0, 4_000),), turns=())
    payload = build_voice_analysis_payload(
        metrics, session_id=99, user_id=1, session_duration_ms=300_000, analyzed_at=AT
    )
    assert "axes" not in payload
    m = payload["metrics"]
    assert isinstance(m, dict)
    assert "speakingRatio" not in m
    assert "longSilenceCount" not in m


# ── 문장 ─────────────────────────────────────────────────────────────
def _metrics(mean_utterance_ms: int, *, response_ms: int = 1_000) -> object:
    turns = (AiTurn(1, "네", 0, 1_000),)
    length = mean_utterance_ms
    start = 1_000 + response_ms
    return compute_voice_metrics(
        utterances=(_u(start, start + length),), turns=turns
    )


def test_headline_without_goal_reports_speaking_time() -> None:
    narrative = build_voice_narrative(_metrics(8_000), session_duration_ms=300_000)  # type: ignore[arg-type]
    assert "5분 0초 중" in narrative.headline
    assert "싶다고" not in narrative.headline


def test_headline_contrasts_goal_with_measurement() -> None:
    """줄이고 싶다고 했는데 이미 짧으면 그 사실을 알린다(규약 6.4)."""
    narrative = build_voice_narrative(
        _metrics(3_000), session_duration_ms=300_000,  # type: ignore[arg-type]
        practice_goals=("TALK_TOO_MUCH",),
    )
    assert "이미 짧게" in narrative.headline


def test_goal_selects_its_mission() -> None:
    narrative = build_voice_narrative(
        _metrics(20_000), session_duration_ms=300_000,  # type: ignore[arg-type]
        practice_goals=("TALK_TOO_MUCH",),
    )
    assert "10초 안에 끊고" in narrative.mission


def test_volume_goal_is_ignored() -> None:
    """음량을 재지 않으므로 성량 목표는 문장에 영향을 주지 않는다."""
    plain = build_voice_narrative(_metrics(8_000), session_duration_ms=300_000)  # type: ignore[arg-type]
    voiced = build_voice_narrative(
        _metrics(8_000), session_duration_ms=300_000,  # type: ignore[arg-type]
        practice_goals=("VOICE_TOO_LOUD", "VOICE_TOO_QUIET"),
    )
    assert voiced.headline == plain.headline
    assert voiced.mission == plain.mission


def test_slow_response_becomes_a_note() -> None:
    narrative = build_voice_narrative(
        _metrics(8_000, response_ms=4_200), session_duration_ms=300_000  # type: ignore[arg-type]
    )
    assert any("입을 열기까지" in n for n in narrative.notes)


def test_report_payload_shape() -> None:
    narrative = build_voice_narrative(_metrics(8_000), session_duration_ms=300_000)  # type: ignore[arg-type]
    payload = build_voice_report_payload(
        narrative, session_id=99, user_id=1001, generated_at=AT
    )
    assert payload["reportVersion"] == "voice-report-v1.0.0"
    assert payload["reportStatus"] == "COMPLETED"
    assert payload["headline"]
    assert payload["nextMission"]


# ── 무응답 / 개입 이후 응답 시간 ─────────────────────────────────────
def test_ai_intervention_does_not_inflate_response_time() -> None:
    """AI가 15초 침묵에 먼저 끼어들면, 그 뒤 사용자 발화는 **개입 발화**에 대한 응답이다.

    창을 안 닫으면 AI가 말한 시간까지 사용자 망설임으로 잡힌다(실측 2초 → 11.5초).
    """
    turns = (AiTurn(1, "안녕하세요", 0, 5_000), AiTurn(2, "주말엔 뭐 하세요?", 20_000, 24_000))
    metrics = compute_voice_metrics(utterances=(_u(26_000, 29_000),), turns=turns)
    assert metrics.mean_response_ms == 2_000
    assert metrics.response_sample_count == 1


def test_unanswered_turn_is_counted() -> None:
    """AI가 물었는데 다음 질문 때까지 한마디도 안 한 경우."""
    turns = (AiTurn(1, "안녕하세요", 0, 5_000), AiTurn(2, "주말엔 뭐 하세요?", 20_000, 24_000))
    metrics = compute_voice_metrics(utterances=(_u(26_000, 29_000),), turns=turns)
    assert metrics.unanswered_turn_count == 1


def test_last_turn_without_answer_is_not_unanswered() -> None:
    """세션 마지막 발화는 그냥 대화가 끝난 것이다 — 말문이 막힌 게 아니다."""
    metrics = compute_voice_metrics(
        utterances=(_u(0, 3_000),), turns=(AiTurn(1, "그럼요", 10_000, 12_000),)
    )
    assert metrics.unanswered_turn_count == 0


def test_answered_turns_are_not_counted_as_unanswered() -> None:
    turns = (AiTurn(1, "안녕", 0, 2_000), AiTurn(2, "그렇군요", 10_000, 12_000))
    metrics = compute_voice_metrics(
        utterances=(_u(3_000, 6_000), _u(14_000, 16_000)), turns=turns
    )
    assert metrics.unanswered_turn_count == 0
    assert metrics.response_sample_count == 2


def test_unanswered_turns_become_a_note() -> None:
    turns = (AiTurn(1, "안녕하세요", 0, 5_000), AiTurn(2, "주말엔?", 20_000, 24_000))
    metrics = compute_voice_metrics(utterances=(_u(26_000, 29_000),), turns=turns)
    narrative = build_voice_narrative(metrics, session_duration_ms=300_000)
    assert any("답을 못 찾은" in n for n in narrative.notes)
