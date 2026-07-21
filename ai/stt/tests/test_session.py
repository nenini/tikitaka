"""화자별 2스트림 멀티플렉싱 테스트 (STT-04). 실제 whisper 없이 mock 엔진 사용."""

import numpy as np

from stt.events import TranscriptEvent, TranscriptPayload
from stt.session import SessionSttRunner, SpeakerStream, make_vad_options


class FakeEngine:
    """transcribe_chunk 시그니처를 흉내내는 가짜 엔진 — 발화당 이벤트 1개 반환."""

    def transcribe_chunk(
        self,
        audio,
        *,
        session_id,
        speaker_id,
        session_elapsed_ms,
        seq_start,
        vad_filter=False,
        min_confidence=0.5,
    ):
        payload = TranscriptPayload(
            text=f"{speaker_id}-utt",
            segment_start_ms=session_elapsed_ms,
            segment_end_ms=session_elapsed_ms + 500,
        )
        return [
            TranscriptEvent(
                session_id=session_id,
                speaker_id=speaker_id,
                seq=seq_start,
                session_elapsed_ms=session_elapsed_ms,
                confidence=0.9,
                payload=payload,
            )
        ]


def _dummy_audio(ms: int = 1000) -> np.ndarray:
    return np.zeros(int(16000 * ms / 1000), dtype=np.float32)


def test_flush_tags_speaker_and_increments_seq():
    s = SpeakerStream(FakeEngine(), session_id="s1", speaker_id="user-A", vad_opts=make_vad_options())
    e1 = s.flush_utterance(_dummy_audio(), start_ms=0)
    e2 = s.flush_utterance(_dummy_audio(), start_ms=2000)
    assert e1[0].speaker_id == "user-A"
    assert e1[0].seq == 0
    assert e2[0].seq == 1  # 화자별 seq 증가


def test_runner_routes_to_correct_speaker():
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    a = runner.flush_utterance("user-A", _dummy_audio(), start_ms=1000)
    b = runner.flush_utterance("user-B", _dummy_audio(), start_ms=1500)
    assert a[0].speaker_id == "user-A"
    assert b[0].speaker_id == "user-B"
    assert a[0].seq == 0 and b[0].seq == 0  # 화자별 독립 seq


def test_common_timeline_ordering():
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    events = []
    events += runner.flush_utterance("user-A", _dummy_audio(), start_ms=3000)
    events += runner.flush_utterance("user-B", _dummy_audio(), start_ms=1000)
    events += runner.flush_utterance("user-A", _dummy_audio(), start_ms=5000)
    events.sort(key=lambda e: e.payload.segment_start_ms)
    order = [(e.speaker_id, e.payload.segment_start_ms) for e in events]
    assert order == [("user-B", 1000), ("user-A", 3000), ("user-A", 5000)]


def test_streams_are_independent():
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    runner.feed("user-A", _dummy_audio(500))  # 무음 → 전사 없음
    runner.feed("user-B", _dummy_audio(500))
    assert runner.stream("user-A") is not runner.stream("user-B")
