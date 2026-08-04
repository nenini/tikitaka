"""Content and silence detector tests using finalized STT v2 events."""

from __future__ import annotations

from stt.events import TranscriptFinalizedEvent, TranscriptPayload

from aggregator.aggregator import SessionAggregator
from aggregator.detectors import SilenceDetector
from aggregator.events import (
    AnalysisEvent,
    FillerDetected,
    QuestionAsked,
    SilenceDetected,
)


def _transcript(
    user_id: str,
    start_ms: int,
    end_ms: int,
    text: str,
    *,
    seq: int = 1,
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id="t",
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
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


def test_question_detected() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_transcript("user-A", 0, 1500, "주말에 뭐 하세요?"))

    questions = [event for event in out if isinstance(event, QuestionAsked)]
    assert len(questions) == 1
    assert questions[0].payload.question_count == 1


def test_statement_is_not_question() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_transcript("user-A", 0, 1500, "저는 그게 좋아요."))
    assert not [event for event in out if isinstance(event, QuestionAsked)]


def test_filler_counted() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_transcript("user-A", 0, 2000, "음 그 약간 좋아요"))

    fillers = [event for event in out if isinstance(event, FillerDetected)]
    assert len(fillers) == 1
    speaker = agg.state.speaker("user-A")
    assert speaker.filler_count == 3
    assert speaker.filler_breakdown == {"음": 1, "그": 1, "약간": 1}


def test_silence_fires_once_then_resets() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator(
        "t",
        on_analysis=out.append,
        detectors=[SilenceDetector()],
    )
    agg.push_transcript(_transcript("user-A", 0, 2000, "안녕하세요"))
    agg.tick(5000)
    assert out == []

    agg.tick(13000)
    assert len(out) == 1
    assert isinstance(out[0], SilenceDetected)
    assert out[0].payload.silence_sec == 11.0

    agg.tick(14000)
    assert len(out) == 1
    agg.push_transcript(
        _transcript("user-A", 15000, 16000, "다시 말합니다", seq=2)
    )
    agg.tick(27000)
    assert len(out) == 2


def test_silence_needs_activity_first() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator(
        "t",
        on_analysis=out.append,
        detectors=[SilenceDetector()],
    )
    agg.tick(60000)
    assert out == []
