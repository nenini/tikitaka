"""BE 전달 페이로드 직렬화 (S15P11A307-494).

BE와 합의한 계약(2026-08-03):
  ① POST /internal/v1/session-analyses        — 객관 지표 (축 점수·행동 지표·근거 구간)
  ② POST /internal/v1/session-reports/results — LLM 생성물 (요약·강점·개선점·미션)

두 API로 나뉜 이유는 재분석·점수 검증 때 수치 원본만 다시 읽을 수 있게 하려는 것이다.

⚠️ `cards`(근거 카드)는 이번 계약에서 **보류**다. 카드가 어느 발화를 가리키는지의 정확도를
   아직 보장할 수 없어서(LLM이 엉뚱한 발화를 지목한다) BE와 합의해 뺐다. 정확도가 확보되면
   AI 쪽에서 먼저 제안한다. 따라서 quote·patternCode·severity·suggestion도 전송되지 않는다.

⚠️ `raw`는 **30분 환산값**이다(`rawUnit=COUNT_PER_30_MINUTES`). 실제 횟수는 `metrics`에
   따로 있다. BE 예시가 30분 세션이라 두 값이 같았을 뿐 세션 길이가 다르면 달라진다.
"""

from __future__ import annotations

from aggregator.report.builder import ReportNarrative
from aggregator.report.input import ReportInput, VisionInput
from aggregator.report.topics import build_topic_breakdown
from aggregator.report.scoring import (
    AXIS_BALANCE,
    AXIS_FLOW,
    AXIS_LISTENING,
    AXIS_NONVERBAL,
    AXIS_QUESTION,
    AXIS_REACTION,
    SILENCE_THRESHOLD_MS,
    AxisScore,
    ReportScores,
    find_long_silences,
    find_overlaps,
)

SCHEMA_VERSION = 1
ANALYSIS_VERSION = "analysis-v1.2.0"
"""2026-08-07 v1.1.0 → v1.2.0.

BE는 이 값을 `(sessionId, analysisVersion)` 멱등 키로 쓰고, **성장 지표 스냅샷에
그대로 기록한다**(`GrowthMetricSnapshot.analysisVersion`). 산출물이 달라졌는데 버전을
그대로 두면 같은 라벨 아래 서로 다른 두 종류의 점수가 섞여 추이가 무의미해진다.

바뀐 것:
  - v1.1.0 에서 되살렸던 `question` 축을 **다시 미측정으로 되돌린다.** 근거였던 STT
    문장부호 복원(initial_prompt)이 무음 환각을 필터에 통과시켜 전사를 오염시켰다.
    성장 지표의 questionScore 가 다시 null 이 되므로 버전을 올려 구분한다.
  - `metrics.questionCount` 도 null 로 되돌린다.
  - `topicBreakdown` 은 v1.1.0 그대로 유지한다.
"""
REPORT_VERSION = "report-v1.2.0"
"""분석 버전과 같이 올린다.

질문 축이 다시 미측정이라 미측정 축 문장 필터가 질문 관련 문장을 도로 버린다.
같은 세션이라도 생성되는 문장 집합이 달라진다. 리포트 본문 스키마는 그대로다.
"""

_AXIS_KEY = {
    AXIS_FLOW: "flow",
    AXIS_QUESTION: "question",
    AXIS_LISTENING: "listening",
    AXIS_REACTION: "reaction",
    AXIS_BALANCE: "balance",
    AXIS_NONVERBAL: "nonverbal",
}
"""한글 축 이름 → BE 계약 키. 대화균형은 balance다(ERD의 aiMannerScore 자리)."""

_UNIT_RATIO = "RATIO"
_UNIT_PER_30MIN = "COUNT_PER_30_MINUTES"


def _axis_payload(axis: AxisScore) -> dict[str, object]:
    if not axis.measured:
        # 계약: measured=false면 score·raw·rawUnit 모두 null
        return {
            "score": None,
            "measured": False,
            "raw": None,
            "rawUnit": None,
            "note": axis.note,
        }
    unit = _UNIT_RATIO if axis.axis == AXIS_BALANCE else _UNIT_PER_30MIN
    return {
        "score": axis.score,
        "measured": True,
        "raw": axis.raw,
        "rawUnit": unit,
        "note": axis.note,
    }


def _coverage(vision: VisionInput | None, duration_ms: int) -> dict[str, float | None]:
    """분석 커버리지 (BE 계약 2026-08-04). 비율은 0~1, **측정 불가는 0이 아니라 null**.

    FE가 70% 미만인 축을 "측정 부족"으로 표기하는 데 쓴다.

    speechRecognitionRate는 현재 항상 null이다 — 신뢰도 미달로 버려진 발화 수를
    SessionState가 모른다(STT 워커 안에서만 센다). 살리려면 STT가 폐기 건수를
    이벤트로 올려줘야 한다.
    """
    if vision is None:
        return {"faceDetectionRate": None, "speechRecognitionRate": None,
                "cameraUptimeRate": None}
    uptime: float | None = None
    if duration_ms > 0 and vision.observation_window_ms > 0:
        uptime = round(min(1.0, vision.observation_window_ms / duration_ms), 4)
    face = None if vision.coverage is None else round(vision.coverage, 4)
    return {
        "faceDetectionRate": face,
        "speechRecognitionRate": None,
        "cameraUptimeRate": uptime,
    }


def _segment(
    index: int, event_type: str, span: tuple[int, int], description: str
) -> dict[str, object]:
    start_ms, end_ms = span
    return {
        "evidenceId": f"{event_type.lower()}-{index}",
        "eventType": event_type,
        "startMs": start_ms,
        "endMs": end_ms,
        "description": description,
    }


def _evidence_segments(report: ReportInput, speaker_id: str) -> list[dict[str, object]]:
    """근거 구간 — 화면 타임라인에 핀으로 찍는 값이다.

    침묵은 세션 공용(두 화자 모두 말하지 않은 구간)이라 참가자마다 같은 값이 들어간다.
    말끊기·맞장구는 그 화자가 한 행동이라 화자별로 다르다.

    LLM을 거치지 않는다 — 전부 타임라인 산술이라 시각이 정확하다. 근거 카드(cards)를
    보류한 이유(LLM이 엉뚱한 발화를 지목한다)가 여기엔 없다.
    """
    timeline = report.all_utterances
    segments: list[dict[str, object]] = []
    for index, span in enumerate(find_long_silences(timeline, SILENCE_THRESHOLD_MS), 1):
        seconds = (span[1] - span[0]) / 1000
        segments.append(
            _segment(index, "LONG_SILENCE", span, f"{seconds:.1f}초 동안 대화가 이어지지 않았습니다.")
        )
    interruptions, backchannels = find_overlaps(timeline, speaker_id)
    for index, span in enumerate(interruptions, 1):
        segments.append(
            _segment(index, "INTERRUPTION", span, "상대의 발화가 끝나기 전에 발화를 시작했습니다.")
        )
    for index, span in enumerate(backchannels, 1):
        segments.append(
            _segment(index, "BACKCHANNEL", span, "상대의 말에 짧게 호응했습니다.")
        )
    segments.sort(key=lambda item: (item["startMs"], item["endMs"]))
    return segments


def build_analysis_payload(
    report: ReportInput,
    scores: ReportScores,
    *,
    session_id: int,
    user_ids: dict[str, int],
    analyzed_at: str,
    analysis_version: str = ANALYSIS_VERSION,
) -> dict[str, object]:
    """①번 API 본문. 수치만 담는다 — LLM 결과는 들어가지 않는다.

    user_ids: AI 내부 문자열 화자 id → BE BIGINT. STT 계약이 userId를 문자열로 받으므로
    (BE BIGINT를 문자열로 실어 보낸다) 전송 직전에 되돌린다.
    analyzed_at: ISO8601 +09:00. 시각은 호출자가 주입한다(테스트 재현성).
    """
    participants: list[dict[str, object]] = []
    for speaker in report.speakers:
        metrics = next(
            (m for m in scores.metrics if m.speaker_id == speaker.speaker_id), None
        )
        if metrics is None:
            continue
        vision_ok = metrics.vision_measured
        participants.append(
            {
                "userId": user_ids[speaker.speaker_id],
                "analysisStatus": "COMPLETED",
                "axes": {
                    _AXIS_KEY[axis.axis]: _axis_payload(axis)
                    for axis in scores.for_speaker(speaker.speaker_id)
                },
                "metrics": {
                    "speakingMs": metrics.speaking_ms,
                    "speakingRatio": metrics.speaking_ratio,
                    "longSilenceCount": metrics.long_silence_count,
                    "silenceThresholdMs": SILENCE_THRESHOLD_MS,
                    "interruptionCount": metrics.interruption_count,
                    "backchannelCount": metrics.backchannel_count,
                    "fillerCount": metrics.filler_count,
                    # 질문은 STT 문장부호 미제공으로 집계를 신뢰할 수 없다(scoring 참고).
                    # 2026-08-06 에 잠깐 집계했다가 v1.2.0 에서 되돌렸다.
                    "questionCount": None,
                    # 계약: visionMeasured=false면 비전 횟수도 null
                    "smileEpisodeCount": metrics.smile_episode_count if vision_ok else None,
                    "gazeAwayCount": metrics.gaze_away_count if vision_ok else None,
                    "faceMissingCount": metrics.face_missing_count if vision_ok else None,
                    "visionMeasured": vision_ok,
                    "coverage": _coverage(
                        report.vision_for(speaker.speaker_id),
                        report.session_duration_ms,
                    ),
                    "fillerBreakdown": dict(metrics.filler_breakdown),
                },
                # 주제별 발화 비중 — 결정적 계산이라 LLM 이 개입하지 않는다.
                # 화면에서 "무슨 얘기를 많이 했나" 막대로 그린다.
                "topicBreakdown": [
                    {
                        "topic": share.topic,
                        "label": share.label,
                        "utteranceCount": share.utterance_count,
                        "speakingMs": share.speaking_ms,
                        "ratio": share.ratio,
                    }
                    for share in build_topic_breakdown(
                        report.all_utterances, speaker.speaker_id
                    )
                ],
                "evidenceSegments": _evidence_segments(report, speaker.speaker_id),
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": analysis_version,
        "sessionId": session_id,
        "analyzedAt": analyzed_at,
        "participants": participants,
    }


def analysis_failure_payload(
    *,
    session_id: int,
    user_ids: list[int],
    analyzed_at: str,
    analysis_version: str = ANALYSIS_VERSION,
) -> dict[str, object]:
    """수치조차 못 낸 경우. 안 보내면 BE가 PENDING에 머문다.

    axes·metrics는 **빈 객체가 아니라 null**이다. `{}`를 보내면 BE가 모든 필드가
    null인 MetricsRequest로 역직렬화해 `@Valid` 캐스케이드가 @NotNull 6건을 한꺼번에
    터뜨린다(speakingMs·longSilenceCount·silenceThresholdMs 등) → 400.
    BE 스키마 주석도 "FAILED이면 axes와 metrics는 null"이라고 못박고 있다.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": analysis_version,
        "sessionId": session_id,
        "analyzedAt": analyzed_at,
        "participants": [
            {
                "userId": user_id,
                "analysisStatus": "FAILED",
                "axes": None,
                "metrics": None,
                "evidenceSegments": [],
            }
            for user_id in user_ids
        ],
    }


def _report_entry(user_id: int, narrative: ReportNarrative) -> dict[str, object]:
    return {
        "userId": user_id,
        "reportStatus": "COMPLETED" if narrative.generated_by_llm else "FALLBACK",
        "generationMode": "LLM" if narrative.generated_by_llm else "RULE_BASED",
        "summaryText": narrative.summary,
        "strengths": list(narrative.strengths),
        "improvements": list(narrative.improvements),
        "nextMissions": list(narrative.missions),
        "failureCode": None,
        "failureReason": None,
    }


def build_report_payload(
    narratives: list[tuple[int, ReportNarrative]],
    *,
    session_id: int,
    generated_at: str,
    analysis_version: str = ANALYSIS_VERSION,
    report_version: str = REPORT_VERSION,
) -> dict[str, object]:
    """②번 API 본문. **세션당 한 번**, 참가자 전원을 배열에 담는다(BE 계약 2026-08-04).

    유저별로 따로 POST하지 않는다. BE는 `sessionId + 전체 버전 문자열 + payload`로
    중복을 걸러낸다 — 같은 버전·같은 payload 재전송만 중복이다.

    주의: `reports[].summaryText`는 LLM 산출물이라 재실행하면 문장이 달라진다.
    같은 세션을 두 번 돌리면 payload가 달라져 BE 중복 판정에 걸리지 않는다.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sessionId": session_id,
        "analysisVersion": analysis_version,
        "reportVersion": report_version,
        "generatedAt": generated_at,
        "reports": [_report_entry(user_id, n) for user_id, n in narratives],
    }


def report_failure_payload(
    *,
    session_id: int,
    user_ids: list[int],
    generated_at: str,
    failure_code: str,
    failure_reason: str,
    analysis_version: str = ANALYSIS_VERSION,
    report_version: str = REPORT_VERSION,
) -> dict[str, object]:
    """생성 자체가 실패한 경우. FAILED도 반드시 보내야 프론트가 PENDING에서 빠져나온다."""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sessionId": session_id,
        "analysisVersion": analysis_version,
        "reportVersion": report_version,
        "generatedAt": generated_at,
        "reports": [
            {
                "userId": user_id,
                "reportStatus": "FAILED",
                "generationMode": "NONE",
                "summaryText": None,
                "strengths": [],
                "improvements": [],
                "nextMissions": [],
                "failureCode": failure_code,
                "failureReason": failure_reason,
            }
            for user_id in user_ids
        ],
    }


def analysis_idempotency_key(session_id: int, analysis_version: str = ANALYSIS_VERSION) -> str:
    """`session-12345-analysis-v1.0.0` — 유저 무관(한 요청에 참가자 전원)."""
    return f"session-{session_id}-{analysis_version}"


def report_idempotency_key(session_id: int, report_version: str = REPORT_VERSION) -> str:
    """`session-12345-report-v1.0.0` — 세션당 하나.

    **BE는 이 헤더를 읽지 않는다**(계약 2026-08-04 갱신). 중복 판정은 `sessionId +
    전체 버전 문자열 + payload`로 하고, 같은 버전에 같은 payload를 다시 보낸 것만
    중복으로 본다. 계산 로직을 고쳐 patch를 올리면 새 결과로 저장된다.

    그래서 키를 메이저까지만 줄이지 않는다 — 줄이면 patch가 달라도 키가 같아져
    BE 규칙과 어긋난 값을 보내게 된다.
    """
    return f"session-{session_id}-{report_version}"
