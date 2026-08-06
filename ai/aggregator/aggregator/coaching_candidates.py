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
    "EXPRESSION_GUIDANCE",
    "VOLUME_GUIDANCE",
]
"""BE `CoachingType` enum과 값 집합이 같아야 한다. BE는 닫힌 enum이라 여기에만 있는
값을 보내면 역직렬화 단계에서 400이 나고 그 코칭은 유실된다.

`SPEAKING_BALANCE`가 여기 있었지만 이걸 만드는 detector가 없었고 BE enum에도 없다.
발화균형 코칭을 켤 때 BE에 enum 추가를 먼저 요청하고 되살린다.

`VOLUME_GUIDANCE`는 2026-08-06 추가 — BE `CoachingType`·FE 유니온에도 같이 넣었다.
"""
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
