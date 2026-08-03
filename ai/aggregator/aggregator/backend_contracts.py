"""Backend v1 contracts and adapters from internal aggregator models."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from aggregator.coaching import CoachingCommand
from aggregator.coaching_candidates import CoachingPriority, CoachingType
from aggregator.coaching_catalog import COACHING_MESSAGES


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BackendCoachingRequest(_CamelModel):
    """Exact DTO sent to Backend's COACHING_REQUESTED v1 endpoint."""

    event_type: Literal["COACHING_REQUESTED"] = "COACHING_REQUESTED"
    version: Literal[1] = 1
    event_id: str
    occurred_at: datetime
    source: Literal["AI_SESSION_SERVER"] = "AI_SESSION_SERVER"
    session_id: str
    target_user_id: str
    coaching_type: CoachingType
    message_key: str
    message_text: str
    priority: CoachingPriority
    reason_code: str
    triggered_at_session_elapsed_ms: int
    expires_at_session_elapsed_ms: int
    deduplication_key: str


BackendCoachingStatus = Literal[
    "DELIVERED",
    "SUPPRESSED",
    "EXPIRED",
    "DUPLICATE",
]


class BackendCoachingReceipt(_CamelModel):
    event_id: str
    status: BackendCoachingStatus


class BackendCoachingResponseData(_CamelModel):
    event_id: str
    status: BackendCoachingStatus


class BackendCoachingResponse(_CamelModel):
    success: bool
    data: BackendCoachingResponseData


def to_backend_coaching_request(
    command: CoachingCommand,
) -> BackendCoachingRequest:
    """Convert internal v2 without weakening it to Backend's fixed v1 DTO."""
    if command.target_user_id is None:
        raise ValueError("Backend coaching requires targetUserId")
    message_text = command.message_text or COACHING_MESSAGES.get(
        command.message_key
    )
    if message_text is None:
        raise ValueError(
            f"No messageText registered for messageKey={command.message_key!r}"
        )
    return BackendCoachingRequest(
        event_id=command.event_id,
        occurred_at=datetime.fromisoformat(command.occurred_at),
        session_id=command.session_id,
        target_user_id=command.target_user_id,
        coaching_type=command.coaching_type,
        message_key=command.message_key,
        message_text=message_text,
        priority=command.priority,
        reason_code=command.reason_code,
        triggered_at_session_elapsed_ms=(
            command.triggered_at_session_elapsed_ms
        ),
        expires_at_session_elapsed_ms=command.expires_at_session_elapsed_ms,
        deduplication_key=command.deduplication_key,
    )
