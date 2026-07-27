"""신호 감지기 — Observer 패턴. '무슨 일이 감지됐다'는 사실(AnalysisEvent)만 낸다.

각 감지기는 필요한 훅만 구현한다:
  - on_utterance: 발화(전사 텍스트)가 도착했을 때 (내용 기반)
  - on_tick:      시간이 흐를 때 (침묵 등 시간 기반)

감지기는 코칭을 직접 만들지 않는다. 감지 사실을 반환할 뿐이고, 코칭 여부는
CoachingPolicy(coaching.py)가 게이트·쿨다운·TTL로 판단한다(친구 리뷰 #2·#3).
"""

from __future__ import annotations

import re

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


class Detector:
    """감지기 베이스. 필요한 훅만 오버라이드한다."""

    def on_utterance(self, state: SessionState, utterance: Utterance) -> list[AnalysisEvent]:
        return []

    def on_tick(self, state: SessionState, now_ms: int) -> list[AnalysisEvent]:
        return []


# ── 질문 감지 (통제실 설계 §4.3, 고정밀 우선) ──────────────────────
# '?'가 1차 신호(문장부호가 있으면 무조건 질문). '?'가 없으면 '세요·죠'처럼 인사·평서와
# 겹치는 어미는 제외하고, 명백한 의문 어미만 본다(고정밀 우선).
_QUESTION_ENDINGS = re.compile(r"(나요|는가요|은가요|ㄴ가요|을까요|ㄹ까요)$")


def _looks_like_question(text: str) -> bool:
    stripped = text.strip().rstrip(".!… ")
    if not stripped:
        return False
    if stripped.endswith("?"):
        return True
    return _QUESTION_ENDINGS.search(stripped) is not None


class QuestionDetector(Detector):
    """발화가 상대에게 던지는 질문인지 감지한다(분석/리포트용, 코칭 트리거 아님)."""

    def on_utterance(self, state: SessionState, utterance: Utterance) -> list[AnalysisEvent]:
        if not _looks_like_question(utterance.text):
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

    def __init__(self, threshold_ms: int = 10_000) -> None:
        self.threshold_ms = threshold_ms
        self._fired_for_ms = -1

    def on_tick(self, state: SessionState, now_ms: int) -> list[AnalysisEvent]:
        if state.last_activity_ms == 0:
            return []
        silent_ms = now_ms - state.last_activity_ms
        if silent_ms < self.threshold_ms or self._fired_for_ms == state.last_activity_ms:
            return []
        self._fired_for_ms = state.last_activity_ms
        event = SilenceDetected(
            session_id=state.session_id,
            speaker_id=None,
            session_elapsed_ms=now_ms,
            payload=SilencePayload(silence_sec=round(silent_ms / 1000, 1)),
        )
        return [event]


def default_detectors() -> list[Detector]:
    """기본 감지기 세트(내용 기반 M1)."""
    return [QuestionDetector(), FillerDetector(), SilenceDetector()]
