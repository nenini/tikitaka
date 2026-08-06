"""STT v2 출력 계약 — 관제실(Session Aggregator) 입력 이벤트 (요구사항.md 기준).

Vision v4 공통 필드명에 통일. Python 내부 snake_case, 외부(JSON) camelCase.
세 이벤트만 보낸다(같은 utteranceId 공유):
- SpeechStartedEvent      (kind=speech,     source=VAD)
- SpeechEndedEvent        (kind=speech,     source=VAD)
- TranscriptFinalizedEvent(kind=transcript, source=WHISPER_STT)

시간 규칙: sessionElapsedMs = 이벤트가 만들어진 시각(VAD 확정/전사 완료). 실제 발화 시각은
payload의 observedStart/EndElapsedMs(speech) 또는 segmentStart/EndMs(transcript)에 둔다.
seq는 이벤트 종류 무관 (sessionId, userId, clientInstanceId) 범위에서 단조 증가.
userId·participantIdentity·시간 anchor는 BE가 주입한다(STT가 추측하지 않음).
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_nonempty(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be empty")
    return value


def _require_uuid(value: str) -> str:
    uuid.UUID(value)  # 형식 불량이면 ValueError
    return value


def _require_utc_iso(value: str) -> str:
    parsed = datetime.fromisoformat(value)  # 'Z'·'+00:00' 모두 허용(3.11+)
    if parsed.utcoffset() is None:
        raise ValueError("occurredAt must include timezone")
    return value


class _CamelModel(BaseModel):
    # snake_case 생성, by_alias=True로 camelCase JSON. model_ 경고 억제. 미지의 필드 거부.
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
        extra="forbid",
    )

    def to_contract(self) -> dict[str, object]:
        """camelCase dict — 관제실 이벤트 계약 형식."""
        return self.model_dump(by_alias=True)


class _SttEvent(_CamelModel):
    """세 이벤트 공통 필드(Vision v4 통일). 하위 클래스가 eventType·kind·source·payload 확정."""

    session_id: str = Field(max_length=128)
    user_id: str = Field(max_length=128)  # BE BIGINT를 문자열로
    participant_identity: str = Field(max_length=128)
    client_instance_id: str  # Vision v4와 통일(구 streamInstanceId)
    seq: int = Field(ge=1)
    utterance_id: str
    session_elapsed_ms: int = Field(ge=0)
    confidence: float = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    version: Literal[2] = 2
    event_id: str = Field(default_factory=_new_uuid)
    occurred_at: str = Field(default_factory=_utcnow_iso)

    @field_validator("session_id", "user_id", "participant_identity")
    @classmethod
    def _v_nonempty(cls, v: str) -> str:
        return _require_nonempty(v)

    @field_validator("event_id", "client_instance_id", "utterance_id")
    @classmethod
    def _v_uuid(cls, v: str) -> str:
        return _require_uuid(v)

    @field_validator("occurred_at")
    @classmethod
    def _v_occurred(cls, v: str) -> str:
        return _require_utc_iso(v)

    @field_validator("confidence")
    @classmethod
    def _v_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("confidence must be finite")
        return v


# ── SPEECH_STARTED ─────────────────────────────────────────────────

class SpeechStartedPayload(_CamelModel):
    observed_start_elapsed_ms: int = Field(ge=0)  # 실제 목소리 시작(관찰)


class SpeechStartedEvent(_SttEvent):
    event_type: Literal["SPEECH_STARTED"] = "SPEECH_STARTED"
    kind: Literal["speech"] = "speech"
    source: Literal["VAD"] = "VAD"
    model_version: str = Field(default="faster-whisper-vad", min_length=1)
    rule_version: str = Field(default="stt-vad-rule-v1", min_length=1)
    payload: SpeechStartedPayload


# ── SPEECH_ENDED ───────────────────────────────────────────────────

TerminationReason = Literal["SILENCE", "MAX_DURATION", "TRACK_ENDED", "SESSION_ENDED"]


class SpeechEndedPayload(_CamelModel):
    observed_start_elapsed_ms: int = Field(ge=0)
    observed_end_elapsed_ms: int = Field(ge=0)
    speech_duration_ms: int = Field(ge=0)
    termination_reason: TerminationReason
    rms_dbfs: float | None = None
    """이 발화의 실효 음량(dBFS). VAD가 잘라낸 음성 구간만 재므로 무음이 안 섞인다.

    관제실이 "목소리를 조금 크게" 코칭을 낼 유일한 근거다. 선택 필드라 기존 fixture와
    다른 생산자(파일 재생 등)는 그대로 통과한다 — 값이 없으면 음량 코칭만 안 나간다.
    float32 [-1,1] 기준이라 일반 발화는 대략 -30 ~ -15 dBFS 다.
    """

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.observed_end_elapsed_ms < self.observed_start_elapsed_ms:
            raise ValueError("observedEndElapsedMs must be >= observedStartElapsedMs")
        if self.speech_duration_ms != self.observed_end_elapsed_ms - self.observed_start_elapsed_ms:
            raise ValueError("speechDurationMs must equal observedEnd - observedStart")
        return self


class SpeechEndedEvent(_SttEvent):
    event_type: Literal["SPEECH_ENDED"] = "SPEECH_ENDED"
    kind: Literal["speech"] = "speech"
    source: Literal["VAD"] = "VAD"
    model_version: str = Field(default="faster-whisper-vad", min_length=1)
    rule_version: str = Field(default="stt-vad-rule-v1", min_length=1)
    payload: SpeechEndedPayload


# ── TRANSCRIPT_FINALIZED ───────────────────────────────────────────

class TranscriptPayload(_CamelModel):
    text: str
    language: str = Field(min_length=1)
    is_final: Literal[True] = True  # 관제실에는 최종 전사만
    segment_start_ms: int = Field(ge=0)
    segment_end_ms: int = Field(ge=0)

    @field_validator("text")
    @classmethod
    def _v_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.segment_end_ms < self.segment_start_ms:
            raise ValueError("segmentEndMs must be >= segmentStartMs")
        return self


class TranscriptFinalizedEvent(_SttEvent):
    event_type: Literal["TRANSCRIPT_FINALIZED"] = "TRANSCRIPT_FINALIZED"
    kind: Literal["transcript"] = "transcript"
    source: Literal["WHISPER_STT"] = "WHISPER_STT"
    model_version: str = Field(default="faster-whisper-large-v3", min_length=1)
    rule_version: str = Field(default="stt-transcript-rule-v1", min_length=1)
    payload: TranscriptPayload


SttEvent = SpeechStartedEvent | SpeechEndedEvent | TranscriptFinalizedEvent
