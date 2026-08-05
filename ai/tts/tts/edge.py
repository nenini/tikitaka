"""edge-tts 엔진 — Microsoft Edge 온라인 TTS (S15P11A307-475).

API 키·계정 없이 쓰는 무료 클라우드 TTS. GPU를 전혀 쓰지 않아 STT(faster-whisper)와
LLM(Ollama)이 6GB VRAM을 나눠 쓰는 이 프로젝트에 맞는다. 선정 근거는 README 참고.

서비스는 24kHz mono MP3를 주므로 디코딩 + 16k 리샘플을 거쳐 계약 형식으로 맞춘다.
"""

from __future__ import annotations

import asyncio
import io
from typing import Iterator

import edge_tts
import numpy as np
import numpy.typing as npt
import soundfile as sf
import soxr

from tts.engine import DEFAULT_CHUNK_MS, SAMPLE_RATE, iter_pcm_chunks, to_pcm16

# 한국어 뉴럴 보이스 (edge-tts list_voices 기준 ko-KR 전량).
KO_FEMALE = "ko-KR-SunHiNeural"
KO_MALE = "ko-KR-InJoonNeural"
KO_MALE_MULTILINGUAL = "ko-KR-HyunsuMultilingualNeural"

DEFAULT_VOICE = KO_FEMALE


def voice_for_gender(gender: str) -> str:
    """페르소나 성별 → 보이스. 챗봇 PersonaSpec.gender("female"|"male")를 그대로 받는다."""
    return KO_MALE if gender.strip().lower().startswith("m") else KO_FEMALE


def decode_to_pcm16(audio: bytes, *, target_rate: int = SAMPLE_RATE) -> npt.NDArray[np.int16]:
    """인코딩된 오디오(MP3 등) → target_rate mono int16 배열.

    스테레오는 채널 평균으로 모노 다운믹스한다.
    """
    data, source_rate = sf.read(io.BytesIO(audio), dtype="float32", always_2d=True)
    mono: npt.NDArray[np.float32] = data.mean(axis=1)
    if source_rate != target_rate:
        mono = soxr.resample(mono, source_rate, target_rate)
    return to_pcm16(mono)


class EdgeTtsEngine:
    """Microsoft Edge 온라인 TTS 엔진. 키 불필요·VRAM 0."""

    def __init__(
        self,
        voice: str = DEFAULT_VOICE,
        *,
        rate: str = "+0%",
        pitch: str = "+0Hz",
        chunk_ms: int = DEFAULT_CHUNK_MS,
    ) -> None:
        self.voice = voice
        self.rate = rate
        self.pitch = pitch
        self.chunk_ms = chunk_ms

    def synthesize(self, text: str) -> Iterator[bytes]:
        """텍스트 → 16k mono PCM 청크. 빈 문자열이면 아무것도 내지 않는다.

        동기 인터페이스라 내부에서 asyncio.run으로 감싼다 —
        **이미 실행 중인 이벤트 루프 안에서는 호출할 수 없다.**
        (async 컨텍스트에서는 asyncio.to_thread로 감싸 쓴다.)
        """
        if not text.strip():
            return
        mp3 = asyncio.run(self._fetch_mp3(text))
        if not mp3:
            return
        yield from iter_pcm_chunks(decode_to_pcm16(mp3), chunk_ms=self.chunk_ms)

    async def _fetch_mp3(self, text: str) -> bytes:
        """edge-tts 스트림에서 오디오 청크만 모아 MP3 바이트로 반환."""
        communicate = edge_tts.Communicate(
            text, self.voice, rate=self.rate, pitch=self.pitch
        )
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                data = chunk.get("data")
                if data:
                    buffer += data
        return bytes(buffer)
