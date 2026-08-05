"""TTS 엔진 인터페이스 — 텍스트 → 16kHz mono PCM 청크 (S15P11A307-475).

챗봇 응답을 소리로 바꾸는 계층. 구현(edge/mock)을 Protocol 뒤에 둬 나중에 교체
가능하게 한다 — chatbot.llm.ChatLLM 과 같은 패턴이다.

출력 계약: **16kHz · mono · signed 16-bit little-endian PCM**.
STT 입력(stt.pipeline.SAMPLE_RATE=16000)과 같은 레이트라 오디오 경로 전체가 16k로 통일된다.

청크로 나눠 내보내는 이유: 사용자가 말을 시작하면(바지인) 재생 중인 음성을 즉시 끊어야
하는데, 통짜 bytes를 반환하면 중간에 멈출 수가 없다.
"""

from __future__ import annotations

from typing import Iterator, Protocol

import numpy as np
import numpy.typing as npt

SAMPLE_RATE = 16_000
SAMPLE_WIDTH = 2  # int16 = 2 bytes
DEFAULT_CHUNK_MS = 20


class TtsEngine(Protocol):
    """텍스트를 16k mono PCM 청크 스트림으로 합성하는 엔진."""

    def synthesize(self, text: str) -> Iterator[bytes]: ...


def to_pcm16(samples: npt.ArrayLike) -> npt.NDArray[np.int16]:
    """float 파형(-1.0~1.0) → int16. 범위를 벗어나는 값은 클리핑한다."""
    scaled: npt.NDArray[np.float32] = np.asarray(samples, dtype=np.float32) * 32767.0
    clipped: npt.NDArray[np.float32] = np.clip(scaled, -32768.0, 32767.0)
    return clipped.astype(np.int16)


def iter_pcm_chunks(
    pcm: npt.NDArray[np.int16], *, chunk_ms: int = DEFAULT_CHUNK_MS
) -> Iterator[bytes]:
    """int16 mono 배열을 고정 길이 청크(bytes)로 자른다.

    마지막 조각은 chunk_ms보다 짧을 수 있다. 빈 배열이면 아무것도 내지 않는다.
    """
    if chunk_ms <= 0:
        raise ValueError("chunk_ms는 1 이상이어야 합니다.")
    step = SAMPLE_RATE * chunk_ms // 1000
    for start in range(0, len(pcm), step):
        yield pcm[start : start + step].tobytes()


def pcm_duration_ms(pcm_bytes: int) -> int:
    """PCM 바이트 수 → 재생 길이(ms). 재생 타이밍·바지인 계산에 쓴다."""
    return pcm_bytes * 1000 // (SAMPLE_RATE * SAMPLE_WIDTH)
