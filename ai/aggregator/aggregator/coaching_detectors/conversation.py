"""Conservative transcript/VAD coaching rules for the first MVP."""

from __future__ import annotations

import re

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState, Utterance

_PUNCTUATION = re.compile(r"[\s.,!?~…]+")
_QUESTION_ENDINGS = (
    "나요",
    "가요",
    "까요",
    "인가요",
    "있어요",
    "없어요",
    "어때요",
    "뭐예요",
    "무엇인가요",
)
_SHORT_VERBAL_REACTIONS = {"네", "예", "응", "아하"}
_VERBAL_REACTION_PHRASES = (
    "맞아요",
    "맞아",
    "그렇군요",
    "그러시구나",
    "그랬군요",
    "정말요",
    "진짜요",
    "좋네요",
)


def _normalize(text: str) -> str:
    return _PUNCTUATION.sub("", text.strip())


def _looks_like_question(text: str) -> bool:
    stripped = text.strip()
    if stripped.endswith("?"):
        return True
    normalized = _normalize(stripped)
    return any(normalized.endswith(ending) for ending in _QUESTION_ENDINGS)


def _looks_like_verbal_reaction(text: str) -> bool:
    normalized = _normalize(text)
    if not normalized or len(normalized) > 20:
        return False
    if normalized in _SHORT_VERBAL_REACTIONS:
        return True
    return any(
        reaction in normalized for reaction in _VERBAL_REACTION_PHRASES
    )


class ConversationCoachingDetector:
    """Track questions/reactions and produce response/reaction candidates."""

    def __init__(self, config: MvpCoachingConfig) -> None:
        self.config = config

    def on_utterance(
        self,
        state: SessionState,
        utterance: Utterance,
    ) -> None:
        user = state.user(utterance.speaker_id)
        if _looks_like_question(utterance.text):
            user.last_question_ended_at_ms = utterance.end_ms
            user.last_question_trigger_id = (
                f"question:{utterance.speaker_id}:{utterance.end_ms}"
            )
        if _looks_like_verbal_reaction(utterance.text):
            user.last_verbal_reaction_at_ms = utterance.end_ms

    def on_tick(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        return [
            *self._response_candidates(state, now_ms),
            *self._reaction_candidates(state, now_ms),
        ]

    def _response_candidates(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        candidates: list[CoachingCandidate] = []
        for questioner in state.users.values():
            question_at = questioner.last_question_ended_at_ms
            trigger_id = questioner.last_question_trigger_id
            if question_at is None or trigger_id is None:
                continue
            if now_ms - question_at < self.config.response_prompt_delay_ms:
                continue
            for target_id in state.participant_user_ids:
                if target_id == questioner.user_id:
                    continue
                target = state.user(target_id)
                if target.is_speaking:
                    continue
                if (
                    target.last_speech_started_at_ms is not None
                    and target.last_speech_started_at_ms >= question_at
                ):
                    continue
                candidates.append(
                    CoachingCandidate(
                        coaching_type="RESPONSE_PROMPT",
                        target_user_id=target_id,
                        message_key="RESPONSE_PROMPT_01",
                        reason_code="QUESTION_WAITING_FOR_RESPONSE",
                        triggered_at_ms=now_ms,
                        trigger_id=f"{trigger_id}:{target_id}",
                        priority="MEDIUM",
                    )
                )
        return candidates

    def _reaction_candidates(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        speakers = [user for user in state.users.values() if user.is_speaking]
        if len(speakers) != 1:
            return []
        speaker = speakers[0]
        started_at = speaker.speech_started_at_ms
        utterance_id = speaker.current_utterance_id
        if started_at is None or utterance_id is None:
            return []
        if now_ms - started_at < self.config.reaction_prompt_delay_ms:
            return []

        candidates: list[CoachingCandidate] = []
        for target_id in state.participant_user_ids:
            if target_id == speaker.user_id:
                continue
            target = state.user(target_id)
            if target.is_speaking:
                continue
            if (
                target.last_verbal_reaction_at_ms is not None
                and target.last_verbal_reaction_at_ms >= started_at
            ):
                continue
            candidates.append(
                CoachingCandidate(
                    coaching_type="REACTION_PROMPT",
                    target_user_id=target_id,
                    message_key="REACTION_PROMPT_01",
                    reason_code="LONG_TALK_WITHOUT_VERBAL_REACTION",
                    triggered_at_ms=now_ms,
                    trigger_id=f"reaction:{utterance_id}:{target_id}",
                    priority="LOW",
                )
            )
        return candidates
