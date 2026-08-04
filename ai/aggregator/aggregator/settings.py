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


def _boolean(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")


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
    transcript_retention_seconds: float = 1_800.0
    transcript_cleanup_interval_seconds: float = 30.0
    transcript_debug_log: bool = False
    transcript_debug_full_on_session_end: bool = False
    # 사후 리포트 LLM — 실시간 코칭(coaching_llm_*)과 **다른 인스턴스**를 쓴다.
    # 실시간은 2초 타임아웃이라 배치 생성(6~10초)과 같은 GPU를 쓰면 코칭이 밀린다.
    report_llm_base_url: str = ""
    report_llm_model: str = "exaone3.5:7.8b"
    report_llm_timeout_seconds: float = 120.0
    report_max_concurrency: int = 1
    report_shutdown_timeout_seconds: float = 30.0
    coaching_llm_enabled: bool = False
    coaching_llm_base_url: str = "http://127.0.0.1:8100"
    coaching_llm_model: str = (
        "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct"
    )
    coaching_llm_timeout_seconds: float = 3.0
    coaching_llm_max_context_utterances: int = 10
    coaching_llm_max_message_characters: int = 100

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
            transcript_retention_seconds=_positive_float(
                "TRANSCRIPT_RETENTION_SECONDS",
                1_800.0,
            ),
            transcript_cleanup_interval_seconds=_positive_float(
                "TRANSCRIPT_CLEANUP_INTERVAL_SECONDS",
                30.0,
            ),
            transcript_debug_log=_boolean(
                "TRANSCRIPT_DEBUG_LOG",
                False,
            ),
            transcript_debug_full_on_session_end=_boolean(
                "TRANSCRIPT_DEBUG_FULL_ON_SESSION_END",
                False,
            ),
            report_llm_base_url=os.getenv(
                "REPORT_LLM_BASE_URL",
                "",
            ).strip().rstrip("/"),
            report_llm_model=os.getenv(
                "REPORT_LLM_MODEL",
                "exaone3.5:7.8b",
            ).strip(),
            report_llm_timeout_seconds=_positive_float(
                "REPORT_LLM_TIMEOUT_SECONDS",
                120.0,
            ),
            report_max_concurrency=_positive_int(
                "REPORT_MAX_CONCURRENCY",
                1,
            ),
            report_shutdown_timeout_seconds=_positive_float(
                "REPORT_SHUTDOWN_TIMEOUT_SECONDS",
                30.0,
            ),
            coaching_llm_enabled=_boolean(
                "COACHING_LLM_ENABLED",
                False,
            ),
            coaching_llm_base_url=os.getenv(
                "COACHING_LLM_BASE_URL",
                "http://127.0.0.1:8100",
            ).strip().rstrip("/"),
            coaching_llm_model=os.getenv(
                "COACHING_LLM_MODEL",
                "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct",
            ).strip(),
            coaching_llm_timeout_seconds=_positive_float(
                "COACHING_LLM_TIMEOUT_SECONDS",
                3.0,
            ),
            coaching_llm_max_context_utterances=_positive_int(
                "COACHING_LLM_MAX_CONTEXT_UTTERANCES",
                10,
            ),
            coaching_llm_max_message_characters=_positive_int(
                "COACHING_LLM_MAX_MESSAGE_CHARACTERS",
                100,
            ),
        )

    @property
    def backend_configured(self) -> bool:
        return bool(self.backend_base_url and self.internal_token)

    @property
    def coaching_llm_configured(self) -> bool:
        return bool(
            self.coaching_llm_enabled
            and self.coaching_llm_base_url
            and self.coaching_llm_model
        )

    @property
    def report_llm_configured(self) -> bool:
        return bool(self.report_llm_base_url and self.report_llm_model)
