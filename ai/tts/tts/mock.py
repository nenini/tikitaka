"""테스트·개발용 가짜 TTS (S15P11A307-475).

네트워크와 모델 없이 파이프라인을 돌리기 위한 스텁. 텍스트 길이에 비례하는 무음 PCM을
결정적으로 낸다 — chatbot.llm.MockLLM 과 같은 역할이다.
"""

from __future__ import annotations

from typing import Iterator

import numpy as np

from tts.engine import DEFAULT_CHUNK_MS, SAMPLE_RATE, iter_pcm_chunks


class MockTts:
    """실제 합성 없이 더미 PCM(무음)을 내는 엔진."""

    def __init__(self, *, ms_per_char: int = 60, chunk_ms: int = DEFAULT_CHUNK_MS) -> None:
        self.ms_per_char = ms_per_char
        self.chunk_ms = chunk_ms

    def synthesize(self, text: str) -> Iterator[bytes]:
        stripped = text.strip()
        if not stripped:
            return
        duration_ms = len(stripped) * self.ms_per_char
        samples = SAMPLE_RATE * duration_ms // 1000
        yield from iter_pcm_chunks(np.zeros(samples, dtype=np.int16), chunk_ms=self.chunk_ms)
