"""AI 화상 세션 리포트 (AIVIDEO-04) — 사람↔사람 6축과 별개 스키마.

6축을 재사용하지 않는 이유는 두 가지다.

1. **발화 비율이 사용자를 재지 않는다.** AI가 말하는 길이는 우리가 정한 값이다
   (`_cap_sentences(max_sentences=2)`, `max_tokens`). 그 값을 줄이면 사용자 비율이
   자동으로 올라간다 — 사용자는 아무것도 바꾸지 않았는데. 사람↔사람에서 50:50이
   목표인 건 상대도 말할 권리가 있기 때문이고, AI는 그럴 필요가 없다.
2. **5분에는 횟수 지표의 표본이 없다.** 6축은 30분 기준으로 환산한다. 5분이면 6배로
   부풀어 침묵 1회(2.5점)와 2회(1.0점)가 극단으로 갈린다.

대신 절대 지표 네 개를 쓴다. 그중 **평균 응답 시간은 AI 세션에서만 정확하다** —
사람↔사람은 상대 발화 종료 시각이 STT 추정치지만, AI 발화는 우리가 만들었으므로
밀리초 단위로 안다.
"""

from __future__ import annotations

from dataclasses import dataclass

from aggregator.transcripts import TranscriptSegment

SCHEMA_VERSION = 1
VOICE_ANALYSIS_VERSION = "voice-analysis-v1.0.0"
VOICE_REPORT_VERSION = "voice-report-v1.0.0"


@dataclass(frozen=True)
class AiTurn:
    """AI가 실제로 **소리 내어 말한** 한 턴.

    `interrupted`는 사용자가 중간에 끼어들어 재생이 끊긴 경우다. 그때 `ended_ms`는
    끊긴 시점이다 — 들리지 않은 뒷부분은 대화가 아니므로 응답 시간 계산의 기준이
    되어서도 안 된다.
    """

    index: int
    text: str
    started_ms: int
    ended_ms: int
    interrupted: bool = False

    @property
    def duration_ms(self) -> int:
        return max(0, self.ended_ms - self.started_ms)


@dataclass(frozen=True)
class VoiceMetrics:
    """5분 세션에서 신뢰할 수 있는 지표만."""

    speaking_ms: int
    """말한 시간 합계. 절대값이라 세션 길이와 무관하게 믿을 수 있다."""

    utterance_count: int
    mean_utterance_ms: float | None
    """한 번에 말한 평균 길이. 개선 목표(발화량)와 직결된다."""

    mean_response_ms: float | None
    """AI 발화 종료 → 사용자 발화 시작. 망설임. **AI 세션 전용 정확 지표.**"""

    response_sample_count: int
    """평균 응답 시간을 낸 표본 수. 0이면 mean_response_ms는 None이다."""

    filler_count: int
    filler_breakdown: dict[str, int]

    ai_turn_count: int
    unanswered_turn_count: int
    """AI가 물었는데 다음 질문 때까지 사용자가 한마디도 안 한 횟수.

    AI가 15초에 개입하므로 '긴 침묵'은 지표로 잡히지 않는다. 대신 이 값이
    '말문이 막혔다'를 드러낸다 — 5분 세션에서 침묵 횟수보다 해석이 명확하다.
    """

    barge_in_count: int
    """사용자가 AI 말을 끊은 횟수. 경청 감점에 쓰지 않는다 — AI 발화를 끊는 건
    사람의 말을 끊는 것과 달리 실례가 아니다. 기록만 한다."""


def compute_voice_metrics(
    *,
    utterances: tuple[TranscriptSegment, ...],
    turns: tuple[AiTurn, ...],
    filler_count: int = 0,
    filler_breakdown: dict[str, int] | None = None,
) -> VoiceMetrics:
    """사용자 발화 + AI 턴 → 지표 네 개. LLM을 쓰지 않는다."""
    ordered = tuple(sorted(utterances, key=lambda u: (u.start_ms, u.end_ms)))
    speaking_ms = sum(u.duration_ms for u in ordered)
    count = len(ordered)
    gaps, unanswered = _response_windows(ordered, turns)
    return VoiceMetrics(
        speaking_ms=speaking_ms,
        utterance_count=count,
        mean_utterance_ms=(speaking_ms / count) if count else None,
        mean_response_ms=(sum(gaps) / len(gaps)) if gaps else None,
        response_sample_count=len(gaps),
        filler_count=filler_count,
        filler_breakdown=dict(filler_breakdown or {}),
        ai_turn_count=len(turns),
        unanswered_turn_count=unanswered,
        barge_in_count=sum(1 for t in turns if t.interrupted),
    )


def _response_windows(
    utterances: tuple[TranscriptSegment, ...], turns: tuple[AiTurn, ...]
) -> tuple[tuple[float, ...], int]:
    """(응답 간격들, 무응답 턴 수).

    간격은 AI 턴이 끝난 시각부터 사용자가 입을 열기까지다. **다음 AI 턴이 시작되면
    거기서 창을 닫는다** — 15초 침묵으로 AI가 먼저 끼어든 경우, 그 뒤에 나온 사용자
    발화는 앞 턴이 아니라 개입 발화에 대한 응답이다. 창을 안 닫으면 AI가 말한 시간까지
    사용자 망설임으로 잡혀 평균이 크게 부풀려진다(실측: 실제 2초 → 11.5초).

    끼어든 턴은 아예 제외한다 — 사용자가 AI 말이 **끝나기 전에** 말한 것이라 망설임이
    아니다.
    """
    gaps: list[float] = []
    unanswered = 0
    for index, turn in enumerate(turns):
        if turn.interrupted:
            continue
        limit = turns[index + 1].started_ms if index + 1 < len(turns) else None
        nxt = next(
            (
                u
                for u in utterances
                if u.start_ms >= turn.ended_ms and (limit is None or u.start_ms < limit)
            ),
            None,
        )
        if nxt is not None:
            gaps.append(float(nxt.start_ms - turn.ended_ms))
        elif limit is not None:
            # 다음 AI 턴이 올 때까지 사용자가 한마디도 안 했다.
            # 세션 마지막 턴(limit=None)은 그냥 대화가 끝난 것이라 세지 않는다.
            unanswered += 1
    return tuple(gaps), unanswered


def build_voice_analysis_payload(
    metrics: VoiceMetrics,
    *,
    session_id: int,
    user_id: int,
    session_duration_ms: int,
    analyzed_at: str,
) -> dict[str, object]:
    """객관 지표 페이로드. **문장보다 먼저 보낸다.**

    LLM 문장 생성은 수 초가 걸리고 실패할 수도 있다. 숫자를 먼저 저장해 두면 나중에
    문장만 다시 만들 수 있다 — 사람↔사람 리포트와 같은 순서다.
    """
    return {
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": VOICE_ANALYSIS_VERSION,
        "sessionId": session_id,
        "userId": user_id,
        "sessionDurationMs": session_duration_ms,
        "analyzedAt": analyzed_at,
        "metrics": {
            "speakingMs": metrics.speaking_ms,
            "utteranceCount": metrics.utterance_count,
            "meanUtteranceMs": _round(metrics.mean_utterance_ms),
            "meanResponseMs": _round(metrics.mean_response_ms),
            "responseSampleCount": metrics.response_sample_count,
            "fillerCount": metrics.filler_count,
            "fillerBreakdown": dict(metrics.filler_breakdown),
            "aiTurnCount": metrics.ai_turn_count,
            "unansweredTurnCount": metrics.unanswered_turn_count,
            "bargeInCount": metrics.barge_in_count,
        },
    }


def _round(value: float | None) -> float | None:
    """측정 불가는 0이 아니라 null이다(리포트 규약)."""
    return None if value is None else round(value, 1)


# ── 문장 (규칙 기반) ─────────────────────────────────────────────────
# 5분 리포트의 문장은 LLM 없이 만든다. 숫자 네 개를 읽는 문장이라 표현의 폭이 좁고,
# LLM을 끼우면 매번 다른 말이 나와 세션 간 비교가 안 된다. 사람↔사람 리포트가
# LLM을 쓰는 건 6축 + 대화 맥락 + 근거 카드까지 엮어야 해서다.

_GOAL_DIRECTION = {
    "TALK_TOO_MUCH": ("발화량을 줄이고", -1),
    "TALK_TOO_LITTLE": ("발화량을 늘리고", 1),
}
"""개선 목표 → (표시 문구, 원하는 방향). 코드는 `practice_goal_catalog.code` 기준이다.

성량 목표(`VOICE_TOO_*`)는 없다 — 음량을 측정하지 않는다. 넣으면 재지도 않은 값을
평가하게 된다.
"""

_GOAL_MISSION = {
    "TALK_TOO_MUCH": "다음엔 한 번 말할 때 10초 안에 끊고 상대에게 넘겨 보세요.",
    "TALK_TOO_LITTLE": "다음엔 상대 이야기에 내 경험을 한 문장씩 덧붙여 보세요.",
}

_DEFAULT_MISSION = "다음엔 상대 이야기에 내 경험을 한마디 얹어 보세요."

_LONG_UTTERANCE_MS = 15_000
_SHORT_UTTERANCE_MS = 5_000
_SLOW_RESPONSE_MS = 3_000


@dataclass(frozen=True)
class VoiceNarrative:
    headline: str
    """개선 목표 대비 한 줄. 목표가 없으면 지표 요약."""

    mission: str
    notes: tuple[str, ...]
    """지표에서 바로 읽히는 관찰. 평가가 아니라 사실 서술."""


def build_voice_narrative(
    metrics: VoiceMetrics,
    *,
    session_duration_ms: int,
    practice_goals: tuple[str, ...] = (),
) -> VoiceNarrative:
    """지표 → 문장. 측정하지 않은 것은 언급하지 않는다."""
    goal = next((g for g in practice_goals if g in _GOAL_DIRECTION), None)
    notes: list[str] = []

    if metrics.mean_utterance_ms is not None:
        seconds = metrics.mean_utterance_ms / 1000
        if seconds >= _LONG_UTTERANCE_MS / 1000:
            notes.append(f"한 번 말할 때 평균 {seconds:.0f}초씩 이어 말했어요.")
        elif seconds <= _SHORT_UTTERANCE_MS / 1000:
            notes.append(f"한 번 말할 때 평균 {seconds:.0f}초로 짧게 끊었어요.")

    if metrics.mean_response_ms is not None and metrics.mean_response_ms >= _SLOW_RESPONSE_MS:
        notes.append(
            f"상대 말이 끝난 뒤 입을 열기까지 평균 {metrics.mean_response_ms / 1000:.1f}초 걸렸어요."
        )

    if metrics.unanswered_turn_count:
        # AI가 15초에 개입하므로 '긴 침묵'은 지표로 안 잡힌다. 대신 이 값이
        # 말문이 막힌 순간을 드러낸다.
        notes.append(
            f"상대가 물었는데 답을 못 찾은 순간이 {metrics.unanswered_turn_count}번 있었어요."
        )

    if metrics.filler_count and metrics.filler_breakdown:
        top = max(metrics.filler_breakdown.items(), key=lambda kv: (kv[1], kv[0]))
        notes.append(f'"{top[0]}"를 {top[1]}번 썼어요.')

    return VoiceNarrative(
        headline=_headline(metrics, session_duration_ms, goal),
        mission=_GOAL_MISSION.get(goal or "", _DEFAULT_MISSION),
        notes=tuple(notes[:3]),
    )


def _headline(
    metrics: VoiceMetrics, session_duration_ms: int, goal: str | None
) -> str:
    spoken = _mmss(metrics.speaking_ms)
    total = _mmss(session_duration_ms)
    if goal is None:
        return f"{total} 중 {spoken} 동안 이야기했어요."

    label, want = _GOAL_DIRECTION[goal]
    if metrics.mean_utterance_ms is None:
        return f"{label} 싶다고 하셨어요. 이번엔 {total} 중 {spoken} 이야기했어요."

    seconds = metrics.mean_utterance_ms / 1000
    # 목표와 측정이 어긋나도 측정을 사실로 삼되, 자기인식을 부정하지 않는다(규약 6.4).
    if want < 0 and seconds < _SHORT_UTTERANCE_MS / 1000:
        return (
            f"{label} 싶다고 하셨는데, 이번엔 한 번에 평균 {seconds:.0f}초로 "
            "이미 짧게 끊어 말했어요."
        )
    if want > 0 and seconds >= _LONG_UTTERANCE_MS / 1000:
        return (
            f"{label} 싶다고 하셨는데, 이번엔 한 번에 평균 {seconds:.0f}초씩 "
            "충분히 이어 말했어요."
        )
    return (
        f"{label} 싶다고 하셨어요. 이번엔 {total} 중 {spoken}, "
        f"한 번에 평균 {seconds:.0f}초였어요."
    )


def _mmss(ms: int) -> str:
    total = max(0, ms) // 1000
    minutes, seconds = divmod(total, 60)
    return f"{minutes}분 {seconds}초" if minutes else f"{seconds}초"


def build_voice_report_payload(
    narrative: VoiceNarrative,
    *,
    session_id: int,
    user_id: int,
    generated_at: str,
) -> dict[str, object]:
    """문장 페이로드. 지표 페이로드가 저장된 **뒤에** 보낸다."""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": VOICE_ANALYSIS_VERSION,
        "reportVersion": VOICE_REPORT_VERSION,
        "sessionId": session_id,
        "userId": user_id,
        "generatedAt": generated_at,
        "reportStatus": "COMPLETED",
        "generationMode": "RULE_BASED",
        "headline": narrative.headline,
        "notes": list(narrative.notes),
        "nextMission": narrative.mission,
    }
