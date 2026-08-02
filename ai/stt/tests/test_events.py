"""STT v2 이벤트 계약 테스트 (요구사항.md) — 3 이벤트 + 검증(valid/invalid)."""

import math
import uuid

import pytest
from pydantic import ValidationError

from stt.events import (
    SpeechEndedEvent,
    SpeechEndedPayload,
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)


def _ids() -> dict[str, str]:
    return {
        "session_id": "session-123",
        "user_id": "123456789012345678",
        "participant_identity": "participant-123",
        "client_instance_id": str(uuid.uuid4()),
        "utterance_id": str(uuid.uuid4()),
    }


def _started(**over: object) -> SpeechStartedEvent:
    base: dict[str, object] = {
        **_ids(), "seq": 1, "session_elapsed_ms": 1350, "confidence": 0.91,
        "payload": SpeechStartedPayload(observed_start_elapsed_ms=1200),
    }
    base.update(over)
    return SpeechStartedEvent(**base)


def _ended(**over: object) -> SpeechEndedEvent:
    base: dict[str, object] = {
        **_ids(), "seq": 2, "session_elapsed_ms": 5900, "confidence": 0.89,
        "payload": SpeechEndedPayload(
            observed_start_elapsed_ms=1200, observed_end_elapsed_ms=5200,
            speech_duration_ms=4000, termination_reason="SILENCE",
        ),
    }
    base.update(over)
    return SpeechEndedEvent(**base)


def _transcript(**over: object) -> TranscriptFinalizedEvent:
    base: dict[str, object] = {
        **_ids(), "seq": 3, "session_elapsed_ms": 7200, "confidence": 0.92,
        "payload": TranscriptPayload(
            text="저는 영화를 보는 것을 좋아해요.", language="ko",
            segment_start_ms=1200, segment_end_ms=5200,
        ),
    }
    base.update(over)
    return TranscriptFinalizedEvent(**base)


# ── 고정값(kind/source/version/modelVersion/ruleVersion) ───────────

def test_fixed_values() -> None:
    s, e, t = _started(), _ended(), _transcript()
    assert (s.kind, s.source, s.version) == ("speech", "VAD", 2)
    assert (s.model_version, s.rule_version) == ("faster-whisper-vad", "stt-vad-rule-v1")
    assert (e.kind, e.source) == ("speech", "VAD")
    assert (t.kind, t.source) == ("transcript", "WHISPER_STT")
    assert t.model_version == "faster-whisper-large-v3"
    assert t.rule_version == "stt-transcript-rule-v1"


def test_camelcase_contract() -> None:
    d = _started().to_contract()
    assert d["eventType"] == "SPEECH_STARTED"
    assert d["kind"] == "speech"
    assert d["source"] == "VAD"
    assert d["clientInstanceId"]
    assert d["ruleVersion"] == "stt-vad-rule-v1"
    assert isinstance(d["userId"], str)
    payload = d["payload"]
    assert isinstance(payload, dict)
    assert payload["observedStartElapsedMs"] == 1200
    assert "client_instance_id" not in d
    assert "session_id" not in d


def test_ended_payload_contract() -> None:
    d = _ended().to_contract()
    p = d["payload"]
    assert isinstance(p, dict)
    assert p["observedEndElapsedMs"] == 5200
    assert p["speechDurationMs"] == 4000
    assert p["terminationReason"] == "SILENCE"


def test_shared_utterance_id() -> None:
    ids = _ids()
    uid = ids["utterance_id"]
    s = _started(**{k: v for k, v in ids.items()})
    t = _transcript(**{k: v for k, v in ids.items()})
    assert s.utterance_id == uid == t.utterance_id


# ── extra=forbid / 잘못된 조합 ─────────────────────────────────────

def test_extra_field_forbidden() -> None:
    with pytest.raises(ValidationError):
        _started(unexpectedField="x")


def test_wrong_source_rejected() -> None:
    with pytest.raises(ValidationError):
        _started(source="WHISPER_STT")  # SPEECH_STARTED는 source=VAD 고정


def test_wrong_kind_rejected() -> None:
    with pytest.raises(ValidationError):
        _transcript(kind="speech")  # TRANSCRIPT는 kind=transcript 고정


# ── 공통 검증 ──────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "over",
    [
        {"session_id": ""},
        {"user_id": "   "},
        {"participant_identity": ""},
        {"user_id": "x" * 129},          # 128자 초과
        {"seq": 0},
        {"session_elapsed_ms": -1},
        {"confidence": 1.5},
        {"confidence": math.nan},         # NaN 금지
        {"confidence": math.inf},         # Inf 금지
        {"client_instance_id": "not-a-uuid"},
        {"occurred_at": "2026-07-28 10:30:00"},  # tz 없음
    ],
)
def test_common_validation_rejects(over: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _started(**over)


# ── payload 검증 ───────────────────────────────────────────────────

def test_ended_duration_must_match() -> None:
    with pytest.raises(ValidationError):
        SpeechEndedPayload(
            observed_start_elapsed_ms=1200, observed_end_elapsed_ms=5200,
            speech_duration_ms=9999, termination_reason="SILENCE",
        )


def test_ended_order_checked() -> None:
    with pytest.raises(ValidationError):
        SpeechEndedPayload(
            observed_start_elapsed_ms=5200, observed_end_elapsed_ms=1200,
            speech_duration_ms=-4000, termination_reason="SILENCE",
        )


def test_bad_termination_reason() -> None:
    with pytest.raises(ValidationError):
        SpeechEndedPayload(
            observed_start_elapsed_ms=0, observed_end_elapsed_ms=1,
            speech_duration_ms=1, termination_reason="NOPE",
        )


def test_transcript_text_not_blank() -> None:
    with pytest.raises(ValidationError):
        TranscriptPayload(text="   ", language="ko", segment_start_ms=0, segment_end_ms=1)


def test_transcript_language_not_empty() -> None:
    with pytest.raises(ValidationError):
        TranscriptPayload(text="x", language="", segment_start_ms=0, segment_end_ms=1)


def test_transcript_isfinal_must_be_true() -> None:
    with pytest.raises(ValidationError):
        TranscriptPayload(
            text="x", language="ko", is_final=False,
            segment_start_ms=0, segment_end_ms=1,
        )


def test_transcript_segment_order() -> None:
    with pytest.raises(ValidationError):
        TranscriptPayload(text="x", language="ko", segment_start_ms=5200, segment_end_ms=1200)
