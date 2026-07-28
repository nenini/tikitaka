"""Internal coaching facts produced by detectors before policy gates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

CoachingType: TypeAlias = Literal[
    "SILENCE_RECOVERY",
    "ATTENTION_RECOVERY",
    "VISION_SETUP_GUIDANCE",
    "REACTION_PROMPT",
    "RESPONSE_PROMPT",
    "SPEAKING_BALANCE",
]
CoachingPriority: TypeAlias = Literal["LOW", "MEDIUM", "HIGH"]


@dataclass(frozen=True)
class CoachingCandidate:
    """A detector's suggestion; CoachingPolicy can still reject it."""

    coaching_type: CoachingType
    target_user_id: str | None
    message_key: str
    reason_code: str
    triggered_at_ms: int
    trigger_id: str
    priority: CoachingPriority = "LOW"

