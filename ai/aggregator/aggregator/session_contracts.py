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
    practice_goals: list[str] = Field(default_factory=list)
    """온보딩 설문 '대화에서 고치고 싶은 점' 코드(`practice_goal_catalog.code`).

    선택 필드다 — BE가 아직 안 보내며, 없으면 리포트가 개인화 없이 그대로 나간다.
    값은 리포트 문장 순서·표현에만 쓰고 **점수 계산에는 쓰지 않는다**(축 점수는
    세션 간 비교 대상이라 사람마다 기준이 달라지면 성장추이가 무너진다).
    """


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
