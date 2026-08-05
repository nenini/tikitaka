"""GMS 엔진 검증 — PCM 디코딩·요청 페이로드·환경변수 (네트워크 불필요).

실제 합성은 크레딧을 쓰므로 테스트에서 호출하지 않는다. httpx.MockTransport로
요청 내용만 확인하고, 응답 처리는 합성한 raw PCM으로 검사한다.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import numpy as np
import pytest

from tts import gms
from tts.engine import SAMPLE_RATE, pcm_duration_ms
from tts.gms import (
    DEFAULT_MODEL,
    KO_DATING_INSTRUCTIONS,
    OPENAI_PCM_RATE,
    GmsConfigError,
    GmsTtsEngine,
    decode_pcm24,
)


def _pcm24_bytes(seconds: float, hz: float = 440.0) -> bytes:
    """OpenAI가 주는 형식(24kHz mono int16 LE, 헤더 없음)의 사인파."""
    t = np.arange(int(OPENAI_PCM_RATE * seconds), dtype=np.float32) / OPENAI_PCM_RATE
    return (np.sin(2 * np.pi * hz * t) * 0.3 * 32767).astype("<i2").tobytes()


def _engine(handler: httpx.MockTransport) -> GmsTtsEngine:
    return GmsTtsEngine(
        base_url="https://example.test/v1",
        api_key="test-key",
        client=httpx.Client(transport=handler),
    )


def _ok_handler(captured: list[httpx.Request]) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, content=_pcm24_bytes(0.5))

    return httpx.MockTransport(handle)


def test_decode_resamples_24k_pcm_to_16k_int16() -> None:
    pcm = decode_pcm24(_pcm24_bytes(0.5))

    assert pcm.dtype == np.int16
    assert pcm.ndim == 1
    # 리샘플은 MP3와 달리 길이가 정확히 보존된다.
    assert abs(len(pcm) - SAMPLE_RATE // 2) < 10


def test_decode_handles_empty_and_odd_length() -> None:
    assert len(decode_pcm24(b"")) == 0
    # 홀수 바이트(잘린 전송)여도 int16 경계까지만 쓰고 죽지 않는다.
    assert len(decode_pcm24(_pcm24_bytes(0.1) + b"\x00")) > 0


def test_decoded_signal_is_not_silence() -> None:
    assert int(np.abs(decode_pcm24(_pcm24_bytes(0.3))).max()) > 1000


def test_synthesize_yields_chunks_matching_duration() -> None:
    engine = _engine(_ok_handler([]))

    chunks = list(engine.synthesize("안녕하세요"))

    assert chunks
    assert pcm_duration_ms(sum(len(c) for c in chunks)) == pytest.approx(500, abs=30)


def test_synthesize_skips_blank_text_without_calling_api() -> None:
    captured: list[httpx.Request] = []
    engine = _engine(_ok_handler(captured))

    assert list(engine.synthesize("   ")) == []
    assert captured == []


def test_request_payload_and_auth() -> None:
    captured: list[httpx.Request] = []
    engine = _engine(_ok_handler(captured))

    list(engine.synthesize("반가워요"))

    request = captured[0]
    assert str(request.url) == "https://example.test/v1/audio/speech"
    assert request.headers["Authorization"] == "Bearer test-key"
    body = json.loads(request.content)
    assert body["model"] == DEFAULT_MODEL
    assert body["input"] == "반가워요"
    assert body["response_format"] == "pcm"
    assert body["instructions"] == KO_DATING_INSTRUCTIONS


def test_instructions_can_be_disabled() -> None:
    captured: list[httpx.Request] = []
    engine = GmsTtsEngine(
        base_url="https://example.test/v1",
        api_key="k",
        instructions=None,
        client=httpx.Client(transport=_ok_handler(captured)),
    )

    list(engine.synthesize("안녕"))

    assert "instructions" not in json.loads(captured[0].content)


def test_http_error_propagates() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(401, text="unauthorized"))
    engine = _engine(transport)

    with pytest.raises(httpx.HTTPStatusError):
        list(engine.synthesize("안녕"))


def test_base_url_trailing_slash_is_normalized() -> None:
    engine = GmsTtsEngine(base_url="https://example.test/v1/", api_key="k")

    assert engine.endpoint == "https://example.test/v1/audio/speech"


@pytest.fixture
def no_dotenv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """실제 ai/tts/.env 를 무시한다 — 개발자 로컬 키가 테스트 결과를 바꾸면 안 된다."""
    monkeypatch.setattr(gms, "_ENV_PATH", tmp_path / "absent.env")


def test_from_env_requires_credentials(
    no_dotenv: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("GMS_BASE_URL", raising=False)
    monkeypatch.delenv("GMS_API_KEY", raising=False)

    with pytest.raises(GmsConfigError):
        GmsTtsEngine.from_env()


def test_from_env_reads_settings(
    no_dotenv: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GMS_BASE_URL", "https://gms.test/v1")
    monkeypatch.setenv("GMS_API_KEY", "secret")
    monkeypatch.setenv("GMS_TTS_VOICE", "coral")

    engine = GmsTtsEngine.from_env()

    assert engine.endpoint == "https://gms.test/v1/audio/speech"
    assert engine.voice == "coral"
    assert engine.model == DEFAULT_MODEL


def test_from_env_reads_dotenv_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "GMS_BASE_URL=https://from-file.test/v1\nGMS_API_KEY=file-key\n", encoding="utf-8"
    )
    monkeypatch.setattr(gms, "_ENV_PATH", env_file)
    monkeypatch.delenv("GMS_BASE_URL", raising=False)
    monkeypatch.delenv("GMS_API_KEY", raising=False)

    engine = GmsTtsEngine.from_env()

    assert engine.endpoint == "https://from-file.test/v1/audio/speech"
    assert engine.api_key == "file-key"
