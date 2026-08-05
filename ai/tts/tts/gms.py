"""GMS(OpenAI 호환) TTS 엔진 — gpt-4o-mini-tts (S15P11A307-475).

SSAFY GMS가 프록시하는 OpenAI `gpt-4o-mini-tts`를 쓴다. edge-tts 대비 결정적 이점은
`instructions`로 **말투를 자연어로 지시**할 수 있다는 것 — 이 프로젝트에서 "AI 티"의
원인은 음색이 아니라 운율(끊어읽기·억양·속도)이었고, edge-tts에는 rate/pitch 말고
운율을 건드릴 수단이 없었다.

응답은 `response_format="pcm"`으로 받는다. 24kHz·16bit·mono raw PCM이 헤더 없이 오므로
MP3 디코딩 단계가 없다(edge-tts는 필요했다). 24k → 16k 리샘플만 거쳐 계약 형식이 된다.

⚠️ 한국어 리스크: OpenAI 보이스는 영어 기반 학습이라 한국어에 영어 억양이 섞일 수 있다.
`KO_DATING_INSTRUCTIONS`가 이를 명시적으로 억제하지만, 보이스별 편차가 있어
실제 합성본 비교가 필요하다.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import httpx
import numpy as np
import numpy.typing as npt
import soxr
from dotenv import load_dotenv

from tts.engine import DEFAULT_CHUNK_MS, SAMPLE_RATE, iter_pcm_chunks

# ai/tts/.env — 실행 위치(cwd)와 무관하게 찾도록 모듈 기준 절대경로로 잡는다.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"

# OpenAI TTS가 pcm 포맷으로 내보내는 고정 레이트. 우리 계약(16k)과 달라 리샘플이 필요하다.
OPENAI_PCM_RATE = 24_000

DEFAULT_MODEL = "gpt-4o-mini-tts"

# gpt-4o-mini-tts 보이스. 한국어 궁합은 보이스마다 다르므로 A/B로 골라야 한다.
# marin·cedar는 최신 세대(자연스러움 우위) — GMS 프록시에서 동작 확인함.
VOICES = (
    "alloy",
    "ash",
    "ballad",
    "cedar",
    "coral",
    "echo",
    "fable",
    "marin",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
)
DEFAULT_VOICE = "nova"

# 운율 지시. 마지막 문장이 영어 억양 혼입(최대 리스크)을 직접 억제한다.
KO_DATING_INSTRUCTIONS = (
    "한국어가 모국어인 20대처럼 말하세요. "
    "소개팅에서 처음 만난 상대와 편하게 이야기하는 상황입니다. "
    "또박또박 낭독하지 말고 실제 대화처럼 자연스럽게, "
    "문장 끝을 부드럽게 흘리며 말하세요. "
    "영어식 억양을 쓰지 마세요."
)


class GmsConfigError(RuntimeError):
    """GMS 접속 설정(베이스 URL·API 키)이 없을 때."""


def decode_pcm24(raw: bytes) -> npt.NDArray[np.int16]:
    """OpenAI pcm 응답(24kHz mono int16 LE, 헤더 없음) → 16kHz int16 배열.

    홀수 바이트로 끝나면(전송 중 잘림) 마지막 1바이트는 버린다 — int16 경계를 맞춘다.
    """
    usable = len(raw) - (len(raw) % 2)
    if usable <= 0:
        return np.empty(0, dtype=np.int16)
    pcm24 = np.frombuffer(raw[:usable], dtype="<i2")
    resampled: npt.NDArray[np.float32] = soxr.resample(
        pcm24.astype(np.float32), OPENAI_PCM_RATE, SAMPLE_RATE
    )
    return np.clip(resampled, -32768.0, 32767.0).astype(np.int16)


class GmsTtsEngine:
    """GMS 프록시를 통한 OpenAI gpt-4o-mini-tts 엔진. VRAM 0, 크레딧 과금."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str = DEFAULT_MODEL,
        voice: str = DEFAULT_VOICE,
        instructions: str | None = KO_DATING_INSTRUCTIONS,
        chunk_ms: int = DEFAULT_CHUNK_MS,
        timeout: float = 30.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.voice = voice
        self.instructions = instructions
        self.chunk_ms = chunk_ms
        self.timeout = timeout
        # 테스트에서 MockTransport 클라이언트를 주입한다. 없으면 호출 시마다 생성.
        self._client = client

    @classmethod
    def from_env(cls) -> GmsTtsEngine:
        """설정을 읽는다 — `GMS_BASE_URL`, `GMS_API_KEY`. 선택: `GMS_TTS_MODEL`, `GMS_TTS_VOICE`.

        `ai/tts/.env`를 먼저 읽고, 이미 설정된 환경변수가 있으면 그쪽을 우선한다
        (셸에서 일회성으로 덮어쓸 수 있게). 키는 코드·커밋에 넣지 않는다.
        """
        load_dotenv(_ENV_PATH, override=False)
        base_url = os.environ.get("GMS_BASE_URL", "").strip()
        api_key = os.environ.get("GMS_API_KEY", "").strip()
        if not base_url or not api_key:
            raise GmsConfigError(
                "GMS_BASE_URL·GMS_API_KEY 환경변수가 필요합니다. "
                "ai/tts/.env 에 넣거나 셸에서 export 하세요."
            )
        return cls(
            base_url=base_url,
            api_key=api_key,
            model=os.environ.get("GMS_TTS_MODEL", DEFAULT_MODEL),
            voice=os.environ.get("GMS_TTS_VOICE", DEFAULT_VOICE),
        )

    @property
    def endpoint(self) -> str:
        """합성 엔드포인트. `GMS_BASE_URL`은 `/v1`까지 포함한 값을 기대한다."""
        return f"{self.base_url}/audio/speech"

    def synthesize(self, text: str) -> Iterator[bytes]:
        """텍스트 → 16k mono PCM 청크. 빈 문자열이면 아무것도 내지 않는다.

        한 호출 = 한 번의 API 요청이다. 호출당 과금 체계라면 문장 단위로 쪼개 부르는 쪽이
        크레딧을 배로 쓰므로, 파이프라인(476)에서 분할 정책을 정한다.
        """
        if not text.strip():
            return
        raw = self._fetch_pcm(text)
        if not raw:
            return
        yield from iter_pcm_chunks(decode_pcm24(raw), chunk_ms=self.chunk_ms)

    def _payload(self, text: str) -> dict[str, str]:
        payload = {
            "model": self.model,
            "voice": self.voice,
            "input": text,
            "response_format": "pcm",
        }
        if self.instructions:
            payload["instructions"] = self.instructions
        return payload

    def _fetch_pcm(self, text: str) -> bytes:
        """합성 요청 → raw PCM 바이트. 실패 시 httpx.HTTPStatusError를 올린다."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self._client is not None:
            response = self._client.post(
                self.endpoint, json=self._payload(text), headers=headers
            )
            response.raise_for_status()
            return response.content
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                self.endpoint, json=self._payload(text), headers=headers
            )
            response.raise_for_status()
            return response.content
