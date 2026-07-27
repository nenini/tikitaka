"""감지기 단위 테스트 — Mock TranscriptEvent 주입(오디오·GPU 불필요)."""

from __future__ import annotations

from stt.events import TranscriptEvent, TranscriptPayload

from aggregator.aggregator import SessionAggregator
from aggregator.detectors import SilenceDetector
from aggregator.events import AnalysisEvent, FillerDetected, QuestionAsked, SilenceDetected


def _tev(speaker_id: str, start_ms: int, end_ms: int, text: str) -> TranscriptEvent:
    return TranscriptEvent(
        session_id="t",
        speaker_id=speaker_id,
        seq=0,
        session_elapsed_ms=start_ms,
        payload=TranscriptPayload(text=text, segment_start_ms=start_ms, segment_end_ms=end_ms),
    )


def test_question_detected() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_tev("user-A", 0, 1500, "주말엔 어떻게 지내세요?"))
    assert [event.event_type for event in out] == ["QUESTION_ASKED"]
    event = out[0]
    assert isinstance(event, QuestionAsked)
    assert event.payload.question_count == 1


def test_statement_is_not_question() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_tev("user-A", 0, 1500, "저는 그거 좋아요."))
    assert out == []


def test_question_count_increments() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_tev("user-A", 0, 1500, "취미는 어떤 거 좋아하세요?"))
    agg.push_transcript(_tev("user-A", 2000, 3500, "주말엔 보통 어디 가세요?"))
    questions = [event for event in out if isinstance(event, QuestionAsked)]
    assert [q.payload.question_count for q in questions] == [1, 2]


def test_filler_counted() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_tev("user-A", 0, 2000, "어 저는 그 약간 좋아요"))
    event = out[0]
    assert isinstance(event, FillerDetected)
    assert event.payload.fillers == ["어", "그", "약간"]
    assert event.payload.filler_count == 3


def test_no_filler_no_event() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append)
    agg.push_transcript(_tev("user-A", 0, 2000, "반갑습니다"))
    assert out == []


def test_silence_fires_once_then_resets() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[SilenceDetector()])
    agg.push_transcript(_tev("user-A", 0, 2000, "안녕하세요"))
    agg.tick(5000)
    assert out == []  # 아직 3초
    agg.tick(13000)
    assert len(out) == 1
    event = out[0]
    assert isinstance(event, SilenceDetected)
    assert event.payload.silence_sec == 11.0
    agg.tick(14000)
    assert len(out) == 1  # 쿨다운: 재발동 안 함

    # 발화 재개 → 다시 침묵하면 재발동
    agg.push_transcript(_tev("user-A", 15000, 16000, "다시 얘기해요"))
    agg.tick(27000)
    assert len(out) == 2


def test_silence_needs_activity_first() -> None:
    out: list[AnalysisEvent] = []
    agg = SessionAggregator("t", on_analysis=out.append, detectors=[SilenceDetector()])
    agg.tick(60000)  # 발화가 아직 없으면 침묵 감지 안 함
    assert out == []
