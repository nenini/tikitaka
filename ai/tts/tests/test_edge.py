"""edge 엔진의 순수 로직 검증 — MP3 디코딩·리샘플·보이스 매핑 (네트워크 불필요).

실제 합성(HTTP 호출)은 데모 스크립트로 확인한다. 여기서는 서비스가 주는 24kHz MP3를
계약 형식(16k mono int16)으로 바꾸는 경로만 검사한다.
"""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf

from tts.edge import KO_FEMALE, KO_MALE, decode_to_pcm16, voice_for_gender
from tts.engine import SAMPLE_RATE


def _mp3_bytes(samples: np.ndarray, rate: int) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, samples, rate, format="MP3")
    return buffer.getvalue()


def _sine(seconds: float, rate: int, hz: float = 440.0) -> np.ndarray:
    t = np.arange(int(rate * seconds), dtype=np.float32) / rate
    return (np.sin(2 * np.pi * hz * t) * 0.3).astype(np.float32)


def test_decode_resamples_24k_mp3_to_16k_int16() -> None:
    pcm = decode_to_pcm16(_mp3_bytes(_sine(0.5, 24_000), 24_000))

    assert pcm.dtype == np.int16
    assert pcm.ndim == 1
    # MP3는 인코더 지연으로 길이가 정확히 보존되지 않아 여유를 둔다.
    assert abs(len(pcm) - SAMPLE_RATE // 2) < SAMPLE_RATE // 10


def test_decode_downmixes_stereo_to_mono() -> None:
    left = _sine(0.3, 24_000, hz=440.0)
    stereo = np.stack([left, np.zeros_like(left)], axis=1)

    pcm = decode_to_pcm16(_mp3_bytes(stereo, 24_000))

    assert pcm.ndim == 1


def test_decode_keeps_rate_when_already_16k() -> None:
    pcm = decode_to_pcm16(_mp3_bytes(_sine(0.5, SAMPLE_RATE), SAMPLE_RATE))

    assert abs(len(pcm) - SAMPLE_RATE // 2) < SAMPLE_RATE // 10


def test_decoded_signal_is_not_silence() -> None:
    pcm = decode_to_pcm16(_mp3_bytes(_sine(0.3, 24_000), 24_000))

    assert int(np.abs(pcm).max()) > 1000


def test_voice_for_gender() -> None:
    assert voice_for_gender("male") == KO_MALE
    assert voice_for_gender("MALE") == KO_MALE
    assert voice_for_gender("female") == KO_FEMALE
    assert voice_for_gender("") == KO_FEMALE  # 미상은 기본 보이스
