"""Local MVP output remains readable without a BE/FE adapter."""

from __future__ import annotations

import pytest

from aggregator.coaching import CoachingCommand
from aggregator.coaching_catalog import COACHING_MESSAGES
from aggregator.console_sink import console_coaching_emit


def test_console_coaching_prints_target_message_and_ttl(
    capsys: pytest.CaptureFixture[str],
) -> None:
    command = CoachingCommand(
        session_id="session-123",
        target_user_id="user-a",
        coaching_type="ATTENTION_RECOVERY",
        message_key="ATTENTION_RECOVERY_01",
        priority="MEDIUM",
        reason_code="PROLONGED_GAZE_AWAY_WHILE_LISTENING",
        triggered_at_session_elapsed_ms=10_000,
        expires_at_session_elapsed_ms=25_000,
        deduplication_key="dedupe",
    )

    console_coaching_emit(command)

    output = capsys.readouterr().out
    assert "user-a" in output
    assert COACHING_MESSAGES["ATTENTION_RECOVERY_01"] in output
    assert "TTL=15000ms" in output
