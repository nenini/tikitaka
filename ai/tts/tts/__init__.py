"""TTS — 텍스트를 16kHz mono PCM 음성으로 합성한다 (S15P11A307-475)."""

from tts.edge import (
    DEFAULT_VOICE,
    KO_FEMALE,
    KO_MALE,
    KO_MALE_MULTILINGUAL,
    EdgeTtsEngine,
    decode_to_pcm16,
    voice_for_gender,
)
from tts.engine import (
    DEFAULT_CHUNK_MS,
    SAMPLE_RATE,
    SAMPLE_WIDTH,
    TtsEngine,
    iter_pcm_chunks,
    pcm_duration_ms,
    to_pcm16,
)
from tts.mock import MockTts

__all__ = [
    "DEFAULT_CHUNK_MS",
    "DEFAULT_VOICE",
    "KO_FEMALE",
    "KO_MALE",
    "KO_MALE_MULTILINGUAL",
    "SAMPLE_RATE",
    "SAMPLE_WIDTH",
    "EdgeTtsEngine",
    "MockTts",
    "TtsEngine",
    "decode_to_pcm16",
    "iter_pcm_chunks",
    "pcm_duration_ms",
    "to_pcm16",
    "voice_for_gender",
]
