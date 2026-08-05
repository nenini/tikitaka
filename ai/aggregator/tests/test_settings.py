"""Environment configuration for separate realtime and report LLMs."""

from __future__ import annotations

import pytest

from aggregator.settings import IntegrationSettings


def test_report_llm_uses_its_own_endpoint_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REPORT_LLM_BASE_URL", "http://report-gpu:11500/")
    monkeypatch.setenv("REPORT_LLM_MODEL", "exaone-report")
    monkeypatch.setenv("REPORT_LLM_TIMEOUT_SECONDS", "12")
    monkeypatch.setenv("REPORT_MAX_CONCURRENCY", "2")
    monkeypatch.setenv("REPORT_SHUTDOWN_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("COACHING_LLM_BASE_URL", "http://coaching-gpu:8100/")
    monkeypatch.setenv("COACHING_LLM_MODEL", "exaone-coaching")

    settings = IntegrationSettings.from_env()

    assert settings.report_llm_base_url == "http://report-gpu:11500"
    assert settings.report_llm_model == "exaone-report"
    assert settings.report_llm_timeout_seconds == 12.0
    assert settings.report_max_concurrency == 2
    assert settings.report_shutdown_timeout_seconds == 45.0
    assert settings.report_llm_configured
    assert settings.coaching_llm_base_url == "http://coaching-gpu:8100"
    assert settings.coaching_llm_model == "exaone-coaching"


def test_report_llm_is_disabled_when_endpoint_is_empty() -> None:
    settings = IntegrationSettings(
        internal_token="token",
        backend_base_url="http://backend:8080",
    )

    assert not settings.report_llm_configured


def test_realtime_coaching_defaults_to_exaone_7_8b() -> None:
    settings = IntegrationSettings(
        internal_token="token",
        backend_base_url="http://backend:8080",
    )

    assert settings.coaching_llm_model == (
        "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct"
    )
    assert settings.coaching_llm_timeout_seconds == 3.0
    assert settings.report_llm_model == "exaone3.5:7.8b"
    assert settings.report_llm_timeout_seconds == 120.0
    assert settings.report_max_concurrency == 1
    assert settings.report_shutdown_timeout_seconds == 30.0
