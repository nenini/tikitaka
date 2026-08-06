"""신호 감지기 — Observer 패턴. '무슨 일이 감지됐다'는 사실(AnalysisEvent)만 낸다.

각 감지기는 필요한 훅만 구현한다:
  - on_utterance: 발화(전사 텍스트)가 도착했을 때 (내용 기반)
  - on_tick:      시간이 흐를 때 (침묵 등 시간 기반)

감지기는 코칭을 직접 만들지 않는다. 감지 사실을 반환할 뿐이고, 코칭 여부는
CoachingPolicy(coaching.py)가 게이트·쿨다운·TTL로 판단한다(친구 리뷰 #2·#3).
"""

from __future__ import annotations

import logging

from aggregator.conversation_signals import (
    DEFAULT_SILENCE_THRESHOLD_MS,
    looks_like_question,
)
from aggregator.events import (
    AnalysisEvent,
    FillerDetected,
    FillerPayload,
    QuestionAsked,
    QuestionPayload,
    SilenceDetected,
    SilencePayload,
)
from aggregator.state import SessionState, Utterance

logger = logging.getLogger(__name__)


class Detector:
    """감지기 베이스. 필요한 훅만 오버라이드한다."""

    def on_utterance(self, state: SessionState, utterance: Utterance) -> list[AnalysisEvent]:
        return []

    def on_tick(self, state: SessionState, now_ms: int) -> list[AnalysisEvent]:
        return []


class QuestionDetector(Detector):
    """발화가 상대에게 던지는 질문인지 감지한다(분석/리포트용, 코칭 트리거 아님)."""

    def on_utterance(self, state: SessionState, utterance: Utterance) -> list[AnalysisEvent]:
        if not looks_like_question(utterance.text):
            return []
        speaker = state.speaker(utterance.speaker_id)
        speaker.question_count += 1
        event = QuestionAsked(
            session_id=state.session_id,
            speaker_id=utterance.speaker_id,
            session_elapsed_ms=utterance.end_ms,
            payload=QuestionPayload(text=utterance.text, question_count=speaker.question_count),
        )
        return [event]


# ── 군말 감지 (통제실 설계 §4.4, 어휘성 best-effort) ────────────────
# large-v3가 순수 hesitation(음/어)을 지우므로 텍스트에 살아남는 어휘성 군말만 잡는다.
_FILLER_TOKENS = frozenset({"그", "약간", "뭐", "인제", "이제", "막", "그니까", "어", "음", "저기"})


class FillerDetector(Detector):
    """발화 텍스트에서 어휘성 군말을 센다(분석/리포트용, 코칭 트리거 아님)."""

    def on_utterance(self, state: SessionState, utterance: Utterance) -> list[AnalysisEvent]:
        hits = [token for token in utterance.text.split() if token in _FILLER_TOKENS]
        if not hits:
            return []
        speaker = state.speaker(utterance.speaker_id)
        speaker.filler_count += len(hits)
        for token in hits:
            speaker.filler_breakdown[token] = (
                speaker.filler_breakdown.get(token, 0) + 1
            )
        event = FillerDetected(
            session_id=state.session_id,
            speaker_id=utterance.speaker_id,
            session_elapsed_ms=utterance.end_ms,
            payload=FillerPayload(fillers=hits, filler_count=speaker.filler_count),
        )
        return [event]


# ── 침묵 감지 (통제실 설계 §4.1) ───────────────────────────────────
class SilenceDetector(Detector):
    """두 화자 모두 임계 이상 침묵하면 SILENCE_DETECTED(감지 사실)를 낸다.

    코칭(질문 추천)은 여기서 만들지 않는다 — CoachingPolicy가 판단한다.
    쿨다운: 한 번 감지하면 발화가 재개될 때까지 재발동하지 않는다.
    """

    def __init__(
        self,
        threshold_ms: int = DEFAULT_SILENCE_THRESHOLD_MS,
        retry_interval_ms: int = 5_000,
    ) -> None:
        self.threshold_ms = threshold_ms
        self.retry_interval_ms = retry_interval_ms
        self._fired_for_ms = -1
        self._fired_at_ms = 0
        self._last_block_reason: str | None = None

    def on_tick(self, state: SessionState, now_ms: int) -> list[AnalysisEvent]:
        speaking = [
            user.user_id for user in state.users.values() if user.is_speaking
        ]
        if speaking:
            return self._blocked("SOMEONE_SPEAKING", state, speakers=speaking)
        if state.last_activity_ms == 0:
            return self._blocked("NO_ACTIVITY_RECORDED", state)
        silent_ms = now_ms - state.last_activity_ms
        if silent_ms < self.threshold_ms:
            return self._blocked(
                "BELOW_THRESHOLD",
                state,
                silent_ms=silent_ms,
                threshold_ms=self.threshold_ms,
            )
        # 한 침묵 구간에 **한 번만** 내면 안 된다. 이 이벤트는 코칭 후보가 되는데,
        # 후보는 중재기(타깃당 1건)와 정책(쿨다운·상한)을 더 통과해야 한다. 한 번
        # 내고 끝내면 그 tick 에 더 높은 순위 후보가 있었다는 이유만으로 그 침묵은
        # 영영 코칭되지 않는다. 실제로 질문 뒤 10초 침묵은 RESPONSE_PROMPT(랭크 1)와
        # 항상 같은 tick·같은 대상에서 만나 항상 졌다.
        #
        # 그래서 침묵이 이어지는 동안 주기적으로 다시 낸다. 중복 발행은 정책이
        # trigger_id 로 막는다 — 그래서 후보의 trigger_id 가 구간마다 안정적이어야 한다
        # (aggregator.tick 참조).
        if (
            self._fired_for_ms == state.last_activity_ms
            and now_ms - self._fired_at_ms < self.retry_interval_ms
        ):
            return self._blocked("ALREADY_FIRED", state)
        self._last_block_reason = None
        self._fired_for_ms = state.last_activity_ms
        self._fired_at_ms = now_ms
        event = SilenceDetected(
            session_id=state.session_id,
            speaker_id=None,
            session_elapsed_ms=now_ms,
            payload=SilencePayload(silence_sec=round(silent_ms / 1000, 1)),
        )
        return [event]

    def _blocked(
        self,
        reason: str,
        state: SessionState,
        **details: object,
    ) -> list[AnalysisEvent]:
        """Record why this tick produced no silence, once per reason change.

        Two production sessions reported zero silence detections with no way
        to tell which of the four conditions held. on_tick runs continuously,
        so only transitions are logged — a steady state says the same thing
        every tick and would bury everything else.
        """
        if reason != self._last_block_reason:
            self._last_block_reason = reason
            logger.info(
                "silence not detected reason=%s session=%s lastActivityMs=%d%s",
                reason,
                state.session_id,
                state.last_activity_ms,
                "".join(f" {key}={value}" for key, value in details.items()),
            )
        return []


def default_detectors() -> list[Detector]:
    """기본 감지기 세트(내용 기반 M1)."""
    return [QuestionDetector(), FillerDetector(), SilenceDetector()]
