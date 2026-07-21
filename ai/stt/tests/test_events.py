"""TranscriptEvent 스키마 계약 테스트 (STT-02)."""

import pytest

from stt.events import TranscriptEvent, TranscriptPayload


def _make() -> TranscriptEvent:
    return TranscriptEvent(
        session_id="session-123",
        speaker_id="user-A",
        seq=42,
        session_elapsed_ms=38120,
        confidence=0.91,
        payload=TranscriptPayload(
            text="최근에는 전시를 자주 보러 가요",
            segment_start_ms=35220,
            segment_end_ms=38120,
        ),
    )


def test_defaults_populated():
    e = _make()
    assert e.event_type == "TranscriptEvent"
    assert e.version == 1
    assert e.event_id  # uuid 자동 생성
    assert "T" in e.occurred_at  # ISO8601
    assert e.source == "stt-adapter"
    assert e.payload.is_final is True
    assert e.payload.language == "ko"


def test_contract_is_camelcase():
    d = _make().to_contract()
    assert d["eventType"] == "TranscriptEvent"
    assert d["sessionId"] == "session-123"
    assert d["speakerId"] == "user-A"
    assert d["seq"] == 42
    assert d["sessionElapsedMs"] == 38120
    assert d["payload"]["segmentStartMs"] == 35220
    assert d["payload"]["segmentEndMs"] == 38120
    assert d["payload"]["isFinal"] is True
    # snake_case 키가 새어나오면 안 됨
    assert "session_id" not in d
    assert "session_elapsed_ms" not in d


def test_required_fields_enforced():
    with pytest.raises(Exception):
        TranscriptEvent(speaker_id="user-A")  # 필수 필드 누락


def test_speaker_separation_tagging():
    # 화자별 분리: 같은 세션이라도 speakerId가 구분되어야 한다
    a = _make()
    b = TranscriptEvent(
        session_id="session-123",
        speaker_id="user-B",
        seq=7,
        session_elapsed_ms=40000,
        payload=TranscriptPayload(text="오 어디로 가셨어요?", segment_start_ms=39000, segment_end_ms=40000),
    )
    assert a.speaker_id != b.speaker_id
    assert a.session_id == b.session_id
