"""SessionAggregator 통합 — 상태 누적·발화비율."""

from __future__ import annotations

from stt.events import TranscriptEvent, TranscriptPayload

from aggregator.aggregator import SessionAggregator
from aggregator.events import AnalysisEvent


def _tev(speaker_id: str, start_ms: int, end_ms: int, text: str) -> TranscriptEvent:
    return TranscriptEvent(
        session_id="t",
        speaker_id=speaker_id,
        seq=0,
        session_elapsed_ms=start_ms,
        payload=TranscriptPayload(text=text, segment_start_ms=start_ms, segment_end_ms=end_ms),
    )


def test_push_updates_state() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[])
    agg.push_transcript(_tev("user-A", 0, 2000, "안녕하세요"))
    speaker = agg.state.speaker("user-A")
    assert len(speaker.utterances) == 1
    assert speaker.speaking_ms == 2000
    assert agg.state.last_activity_ms == 2000


def test_speaking_ratio_two_speakers() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[])
    agg.push_transcript(_tev("user-A", 0, 6000, "제 얘기를 길게 합니다"))
    agg.push_transcript(_tev("user-B", 6000, 10000, "짧게 답해요"))
    assert agg.state.speaking_ratio("user-A") == 0.6
    assert agg.state.speaking_ratio("user-B") == 0.4


def test_speaking_ratio_single_speaker_none() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[])
    agg.push_transcript(_tev("user-A", 0, 2000, "혼자 말해요"))
    assert agg.state.speaking_ratio("user-A") is None
