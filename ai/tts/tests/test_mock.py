"""MockTts 검증 — 결정적 더미 PCM."""

from __future__ import annotations

from tts.engine import SAMPLE_RATE, pcm_duration_ms
from tts.mock import MockTts


def test_duration_scales_with_text_length() -> None:
    engine = MockTts(ms_per_char=60)

    short = b"".join(engine.synthesize("안녕"))
    long = b"".join(engine.synthesize("안녕하세요 반가워요"))

    assert pcm_duration_ms(len(short)) == 2 * 60
    assert pcm_duration_ms(len(long)) > pcm_duration_ms(len(short))


def test_blank_text_yields_nothing() -> None:
    engine = MockTts()

    assert list(engine.synthesize("")) == []
    assert list(engine.synthesize("   ")) == []


def test_chunks_are_bytes_of_expected_size() -> None:
    engine = MockTts(ms_per_char=60, chunk_ms=20)

    chunks = list(engine.synthesize("안녕하세요"))

    assert chunks
    assert all(isinstance(c, bytes) for c in chunks)
    assert all(len(c) == 20 * SAMPLE_RATE // 1000 * 2 for c in chunks)


def test_output_is_deterministic() -> None:
    engine = MockTts()

    assert b"".join(engine.synthesize("같은 입력")) == b"".join(engine.synthesize("같은 입력"))
