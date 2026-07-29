"""통제실 출력 계약 — AnalysisEvent.

STT `events.py`와 같은 패턴: 내부 snake_case로 생성하고 by_alias=True로 camelCase JSON을 얻는다.
이벤트별로 payload 타입을 분리(discriminated union)해 Any 없이 정적 타입을 보장한다.
이 이벤트가 BE 실시간 분석 이벤트(#112)로 나가는 형식과 동형이다.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_event_id() -> str:
    return str(uuid.uuid4())


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── payload (이벤트별 타입) ────────────────────────────────────────
class SilencePayload(_CamelModel):
    silence_sec: float


class QuestionPayload(_CamelModel):
    text: str
    question_count: int


class FillerPayload(_CamelModel):
    fillers: list[str]
    filler_count: int


# ── 이벤트 봉투 (공통 필드) ────────────────────────────────────────
class _AnalysisEventBase(_CamelModel):
    session_id: str
    speaker_id: str | None = None          # None = 세션 전체(침묵 등)
    session_elapsed_ms: int

    event_id: str = Field(default_factory=_new_event_id)
    version: Literal[1] = 1
    occurred_at: str = Field(default_factory=_utcnow_iso)
    source: str = "aggregator"

    def to_contract(self) -> dict[str, object]:
        """camelCase dict — BE 분석 이벤트(#112) 계약 형식."""
        return self.model_dump(by_alias=True)


class SilenceDetected(_AnalysisEventBase):
    event_type: Literal["SILENCE_DETECTED"] = "SILENCE_DETECTED"
    payload: SilencePayload


class QuestionAsked(_AnalysisEventBase):
    event_type: Literal["QUESTION_ASKED"] = "QUESTION_ASKED"
    payload: QuestionPayload


class FillerDetected(_AnalysisEventBase):
    event_type: Literal["FILLER_DETECTED"] = "FILLER_DETECTED"
    payload: FillerPayload


AnalysisEvent = Union[SilenceDetected, QuestionAsked, FillerDetected]
