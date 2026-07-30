"""Backend -> AI session lifecycle v1 contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SessionParticipant(_CamelModel):
    user_id: str
    participant_identity: str
    stt_enabled: bool
    vision_enabled: bool


class SessionFeatures(_CamelModel):
    stt_enabled: bool
    vision_enabled: bool
    coaching_enabled: bool


class LiveKitConnection(_CamelModel):
    url: str = Field(min_length=1)
    room_name: str = Field(min_length=1)
    access_token: SecretStr = Field(min_length=1, repr=False)
    participant_identity: str = Field(min_length=1)


class SessionEventRequest(_CamelModel):
    event_id: str = Field(min_length=1)
    event_type: str = Field(min_length=1)
    version: int = Field(ge=1)
    session_id: str = Field(min_length=1)
    actual_start_at: datetime | None = None
    ended_at: datetime | None = None
    participants: list[SessionParticipant] | None = None
    features: SessionFeatures | None = None
    live_kit: LiveKitConnection | None = None
    reason: str | None = None


class SessionEventResponse(_CamelModel):
    event_id: str
    status: Literal["PROCESSED", "DUPLICATE"]
