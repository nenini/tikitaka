"""Rule-based coaching policy for the control-room MVP."""

from __future__ import annotations

import uuid
from collections import deque
from dataclasses import replace
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from aggregator.coaching_candidates import (
    CoachingCandidate,
    CoachingPriority,
    CoachingType,
)
from aggregator.coaching_catalog import (
    COACHING_KEYS_BY_TYPE,
    COACHING_MESSAGES,
    COACHING_TEMPLATES,
)
from aggregator.config import MvpCoachingConfig
from aggregator.events import AnalysisEvent, SilenceDetected
from aggregator.state import SessionState

_TRIGGER_DEDUPE_CAPACITY = 4096


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_event_id() -> str:
    return str(uuid.uuid4())


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CoachingCommand(_CamelModel):
    """Final command emitted after cooldown, TTL, and duplicate gates."""

    event_type: Literal["COACHING_REQUESTED"] = "COACHING_REQUESTED"
    session_id: str
    target_user_id: str | None
    coaching_type: CoachingType
    message_key: str
    priority: CoachingPriority
    reason_code: str
    triggered_at_session_elapsed_ms: int
    expires_at_session_elapsed_ms: int
    deduplication_key: str
    # Runtime-only override. Internal v2 remains stable and Backend receives it
    # as messageText after local contextual generation.
    message_text: str | None = Field(default=None, exclude=True)

    event_id: str = Field(default_factory=_new_event_id)
    version: Literal[2] = 2
    occurred_at: str = Field(default_factory=_utcnow_iso)
    source: Literal["aggregator"] = "aggregator"

    def to_contract(self) -> dict[str, object]:
        return self.model_dump(by_alias=True)


class CoachingPolicy:
    """Converts candidates into commands with common safety gates."""

    def __init__(
        self,
        *,
        config: MvpCoachingConfig | None = None,
        cooldown_ms: int | None = None,
        ttl_ms: int | None = None,
        max_per_session: int | None = None,
    ) -> None:
        resolved = config if config is not None else MvpCoachingConfig()
        if cooldown_ms is not None:
            resolved = replace(resolved, default_cooldown_ms=cooldown_ms)
        if ttl_ms is not None:
            resolved = replace(resolved, coaching_ttl_ms=ttl_ms)
        if max_per_session is not None:
            resolved = replace(resolved, max_per_session=max_per_session)
        self.config = resolved
        self._last_by_target_and_type: dict[tuple[str, str], int] = {}
        self._count_by_target: dict[str, int] = {}
        self._count_by_target_and_type: dict[tuple[str, str], int] = {}
        self._message_index_by_target_and_type: dict[tuple[str, str], int] = {}
        self._seen_trigger_keys: set[tuple[str, str, str]] = set()
        self._trigger_key_order: deque[tuple[str, str, str]] = deque()
        self._count = 0

    def evaluate(
        self,
        event: AnalysisEvent,
        state: SessionState,
    ) -> CoachingCommand | None:
        """Compatibility path for the existing transcript-based MVP detectors."""
        if not isinstance(event, SilenceDetected):
            return None
        return self.evaluate_candidate(
            CoachingCandidate(
                coaching_type="SILENCE_RECOVERY",
                target_user_id=None,
                message_key="SILENCE_RECOVERY_01",
                reason_code="LONG_SILENCE",
                triggered_at_ms=event.session_elapsed_ms,
                trigger_id=event.event_id,
                priority="LOW",
            ),
            state,
        )

    def evaluate_candidate(
        self,
        candidate: CoachingCandidate,
        state: SessionState,
    ) -> CoachingCommand | None:
        if not state.session_active:
            return None
        if candidate.message_key not in COACHING_MESSAGES:
            raise ValueError(f"Unknown coaching messageKey: {candidate.message_key}")
        if self._count >= self.config.max_per_session:
            return None

        target = candidate.target_user_id or "session"
        target_count = self._count_by_target.get(target, 0)
        if target != "session" and target_count >= self.config.max_per_user:
            return None
        target_type_key = (target, candidate.coaching_type)
        target_type_count = self._count_by_target_and_type.get(
            target_type_key, 0
        )
        if (
            candidate.coaching_type == "EXPRESSION_GUIDANCE"
            and target_type_count >= self.config.low_smile_max_per_user
        ):
            return None

        trigger_key = (target, candidate.coaching_type, candidate.trigger_id)
        if trigger_key in self._seen_trigger_keys:
            return None

        # Setup problems are independent: an initialization hiccup must not
        # silence a later face-missing or low-light instruction.
        cooldown_scope = (
            candidate.reason_code
            if candidate.coaching_type == "VISION_SETUP_GUIDANCE"
            else candidate.coaching_type
        )
        cooldown_key = (target, cooldown_scope)
        last = self._last_by_target_and_type.get(cooldown_key)
        cooldown_ms = self.config.cooldown_for(candidate.coaching_type)
        if last is not None and candidate.triggered_at_ms - last < cooldown_ms:
            return None

        self._last_by_target_and_type[cooldown_key] = candidate.triggered_at_ms
        self._count_by_target[target] = target_count + 1
        self._count_by_target_and_type[target_type_key] = target_type_count + 1
        self._count += 1
        self._remember_trigger(trigger_key)
        message_key = self._next_message_key(candidate, target)
        return CoachingCommand(
            session_id=state.session_id,
            target_user_id=candidate.target_user_id,
            coaching_type=candidate.coaching_type,
            message_key=message_key,
            priority=candidate.priority,
            reason_code=candidate.reason_code,
            triggered_at_session_elapsed_ms=candidate.triggered_at_ms,
            expires_at_session_elapsed_ms=(
                candidate.triggered_at_ms + self.config.coaching_ttl_ms
            ),
            deduplication_key=(
                f"{state.session_id}:{target}:{candidate.coaching_type}:"
                f"{candidate.trigger_id}"
            ),
        )

    def _next_message_key(
        self,
        candidate: CoachingCandidate,
        target: str,
    ) -> str:
        keys = COACHING_KEYS_BY_TYPE.get(candidate.coaching_type)
        if not keys:
            return candidate.message_key
        counter_key = (target, candidate.coaching_type)
        index = self._message_index_by_target_and_type.get(counter_key, 0)
        self._message_index_by_target_and_type[counter_key] = index + 1
        return keys[index % len(keys)]

    def _remember_trigger(self, trigger_key: tuple[str, str, str]) -> None:
        self._seen_trigger_keys.add(trigger_key)
        self._trigger_key_order.append(trigger_key)
        if len(self._trigger_key_order) > _TRIGGER_DEDUPE_CAPACITY:
            expired = self._trigger_key_order.popleft()
            self._seen_trigger_keys.discard(expired)


def noop_coaching(command: CoachingCommand) -> None:
    """Default sink used when no coaching consumer has been connected."""
    return None


__all__ = [
    "COACHING_TEMPLATES",
    "CoachingCandidate",
    "CoachingCommand",
    "CoachingPolicy",
    "CoachingPriority",
    "CoachingType",
    "noop_coaching",
]
