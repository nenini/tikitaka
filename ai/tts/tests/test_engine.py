"""출력 계약 헬퍼 검증 — 청킹·int16 변환·길이 계산."""

from __future__ import annotations

import numpy as np
import pytest

from tts.engine import SAMPLE_RATE, iter_pcm_chunks, pcm_duration_ms, to_pcm16


def test_chunks_have_exact_size_except_last() -> None:
    pcm = np.zeros(SAMPLE_RATE // 10, dtype=np.int16)  # 100ms
    chunks = list(iter_pcm_chunks(pcm, chunk_ms=20))

    assert len(chunks) == 5
    assert all(len(c) == 20 * SAMPLE_RATE // 1000 * 2 for c in chunks)


def test_last_chunk_may_be_short() -> None:
    pcm = np.zeros(SAMPLE_RATE // 10 + 80, dtype=np.int16)  # 100ms + 5ms
    chunks = list(iter_pcm_chunks(pcm, chunk_ms=20))

    assert len(chunks) == 6
    assert len(chunks[-1]) == 80 * 2


def test_empty_input_yields_nothing() -> None:
    assert list(iter_pcm_chunks(np.zeros(0, dtype=np.int16))) == []


def test_invalid_chunk_ms_rejected() -> None:
    with pytest.raises(ValueError):
        list(iter_pcm_chunks(np.zeros(10, dtype=np.int16), chunk_ms=0))


def test_to_pcm16_scales_and_clips() -> None:
    out = to_pcm16(np.array([0.0, 1.0, -1.0, 2.0, -2.0], dtype=np.float32))

    assert out.dtype == np.int16
    assert out[0] == 0
    assert out[1] == 32767
    assert out[2] == -32767
    assert out[3] == 32767  # 범위 초과는 클리핑
    assert out[4] == -32768


def test_pcm_duration_ms() -> None:
    one_second = SAMPLE_RATE * 2  # int16 = 2바이트
    assert pcm_duration_ms(one_second) == 1000
    assert pcm_duration_ms(one_second // 2) == 500
    assert pcm_duration_ms(0) == 0
