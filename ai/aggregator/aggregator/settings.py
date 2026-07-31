"""Environment settings for the control-room HTTP integration."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


def _positive_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = float(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


@dataclass(frozen=True)
class IntegrationSettings:
    """Small, dependency-free settings object loaded from environment."""

    internal_token: str
    backend_base_url: str
    backend_request_timeout_seconds: float = 5.0
    backend_max_attempts: int = 3
    backend_retry_delay_seconds: float = 1.0
    tick_interval_seconds: float = 0.5
    shutdown_flush_timeout_seconds: float = 3.0
    stt_model_size: str = "large-v3"
    stt_device: str = "cuda"
    stt_compute_type: str = "float16"
    stt_language: str = "ko"
    stt_vad_threshold: float = 0.5
    stt_end_silence_ms: int = 700
    stt_min_confidence: float = 0.5
    stt_max_pending: int = 8

    @classmethod
    def from_env(cls) -> IntegrationSettings:
        load_dotenv()
        return cls(
            internal_token=os.getenv("AI_SESSION_INTERNAL_TOKEN", "").strip(),
            backend_base_url=os.getenv("BACKEND_BASE_URL", "").strip().rstrip("/"),
            backend_request_timeout_seconds=_positive_float(
                "BACKEND_REQUEST_TIMEOUT_SECONDS",
                5.0,
            ),
            backend_max_attempts=_positive_int(
                "BACKEND_EVENT_MAX_ATTEMPTS",
                3,
            ),
            backend_retry_delay_seconds=_positive_float(
                "BACKEND_EVENT_RETRY_DELAY_SECONDS",
                1.0,
            ),
            tick_interval_seconds=_positive_float(
                "AGGREGATOR_TICK_INTERVAL_SECONDS",
                0.5,
            ),
            shutdown_flush_timeout_seconds=_positive_float(
                "AGGREGATOR_SHUTDOWN_FLUSH_TIMEOUT_SECONDS",
                3.0,
            ),
            stt_model_size=os.getenv(
                "STT_MODEL_SIZE",
                "large-v3",
            ).strip(),
            stt_device=os.getenv("STT_DEVICE", "cuda").strip(),
            stt_compute_type=os.getenv(
                "STT_COMPUTE_TYPE",
                "float16",
            ).strip(),
            stt_language=os.getenv("STT_LANGUAGE", "ko").strip(),
            stt_vad_threshold=float(
                os.getenv("STT_VAD_THRESHOLD", "0.5")
            ),
            stt_end_silence_ms=_positive_int(
                "STT_END_SILENCE_MS",
                700,
            ),
            stt_min_confidence=float(
                os.getenv("STT_MIN_CONFIDENCE", "0.5")
            ),
            stt_max_pending=_positive_int("STT_MAX_PENDING", 8),
        )

    @property
    def backend_configured(self) -> bool:
        return bool(self.backend_base_url and self.internal_token)
