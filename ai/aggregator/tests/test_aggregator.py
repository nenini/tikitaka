"""SessionAggregator integration tests for the STT v2 boundary."""

from __future__ import annotations

from stt.events import (
    SpeechEndedEvent,
    SpeechEndedPayload,
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

from aggregator.aggregator import SessionAggregator
from aggregator.events import AnalysisEvent

_CLIENT_A = "11111111-1111-4111-8111-111111111111"
_CLIENT_B = "22222222-2222-4222-8222-222222222222"


def _transcript(
    user_id: str,
    start_ms: int,
    end_ms: int,
    text: str,
    *,
    client_id: str = _CLIENT_A,
    seq: int = 1,
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id="t",
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id=client_id,
        utterance_id=f"00000000-0000-4000-8000-{seq:012d}",
        seq=seq,
        session_elapsed_ms=end_ms,
        confidence=0.9,
        payload=TranscriptPayload(
            text=text,
            language="ko",
            segment_start_ms=start_ms,
            segment_end_ms=end_ms,
        ),
    )


def test_finalized_transcript_updates_state() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[])

    agg.push_transcript(_transcript("user-A", 0, 2000, "안녕하세요"))

    speaker = agg.state.speaker("user-A")
    assert len(speaker.utterances) == 1
    assert speaker.speaking_ms == 2000
    assert agg.state.last_activity_ms == 2000


def test_speaking_ratio_two_speakers() -> None:
    agg = SessionAggregator("t", on_analysis=lambda _: None, detectors=[])
    agg.push_transcript(_transcript("user-A", 0, 6000, "길게 말합니다"))
    agg.push_transcript(
        _transcript(
            "user-B",
            6000,
            10000,
            "짧게 답합니다",
            client_id=_CLIENT_B,
        )
    )

    assert agg.state.speaking_ratio("user-A") == 0.6
    assert agg.state.speaking_ratio("user-B") == 0.4


def test_speaking_ratio_single_speaker_none() -> None:
    agg = SessionAggregator("t", on_analysis=lambda _: None, detectors=[])
    agg.push_transcript(_transcript("user-A", 0, 2000, "혼자 말합니다"))
    assert agg.state.speaking_ratio("user-A") is None


def test_speech_events_update_runtime_state() -> None:
    agg = SessionAggregator("t", on_analysis=lambda _: None, detectors=[])
    utterance_id = "00000000-0000-4000-8000-000000000099"
    started = SpeechStartedEvent(
        session_id="t",
        user_id="user-A",
        participant_identity="participant-user-A",
        client_instance_id=_CLIENT_A,
        utterance_id=utterance_id,
        seq=1,
        session_elapsed_ms=1000,
        confidence=0.9,
        payload=SpeechStartedPayload(observed_start_elapsed_ms=1000),
    )
    ended = SpeechEndedEvent(
        session_id="t",
        user_id="user-A",
        participant_identity="participant-user-A",
        client_instance_id=_CLIENT_A,
        utterance_id=utterance_id,
        seq=2,
        session_elapsed_ms=2500,
        confidence=0.9,
        payload=SpeechEndedPayload(
            observed_start_elapsed_ms=1000,
            observed_end_elapsed_ms=2500,
            speech_duration_ms=1500,
            termination_reason="SILENCE",
        ),
    )

    assert agg.push_stt_event(started)
    assert agg.state.user("user-A").is_speaking
    assert agg.push_stt_event(ended)
    assert not agg.state.user("user-A").is_speaking
    assert agg.state.user("user-A").last_speech_ended_at_ms == 2500


def test_duplicate_stt_event_is_ignored() -> None:
    agg = SessionAggregator("t", on_analysis=lambda _: None, detectors=[])
    event = _transcript("user-A", 0, 1000, "중복 검사")

    assert agg.push_stt_event(event)
    assert not agg.push_stt_event(event)
    assert len(agg.state.speaker("user-A").utterances) == 1


def test_vision_tick_does_not_wake_speech_time_detectors() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator(
        "t",
        on_analysis=out.append,
        participant_user_ids=["user-A", "user-B"],
    )
    agg.push_transcript(_transcript("user-A", 0, 1_000, "안녕하세요"))

    # Even a far-ahead browser timestamp must not be interpreted as STT
    # silence. The authoritative session/STT scheduler calls ``tick``.
    agg.tick_vision(100_000)

    assert not any(event.event_type == "SILENCE_DETECTED" for event in out)
