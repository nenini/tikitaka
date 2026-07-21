"""STT 출력 계약 — TranscriptEvent.

AI 아키텍처 설계서 §7.2의 이벤트 계약을 따른다.
Python 내부는 snake_case, 외부(JSON) 계약은 camelCase로 직렬화한다.
이 이벤트가 통제실(Session Aggregator)의 입력이 된다.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _CamelModel(BaseModel):
    # snake_case로 생성하고 by_alias=True로 camelCase JSON을 얻는다.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TranscriptPayload(_CamelModel):
    text: str
    is_final: bool = True
    language: str = "ko"
    segment_start_ms: int
    segment_end_ms: int


class TranscriptEvent(_CamelModel):
    session_id: str
    speaker_id: str
    seq: int
    session_elapsed_ms: int
    payload: TranscriptPayload

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = "TranscriptEvent"
    version: int = 1
    occurred_at: str = Field(default_factory=_utcnow_iso)
    confidence: float | None = None
    source: str = "stt-adapter"

    def to_contract(self) -> dict:
        """camelCase dict — 아키텍처 이벤트 계약 형식으로 직렬화."""
        return self.model_dump(by_alias=True)
