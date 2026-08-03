"""Internal coaching v2 -> Backend COACHING_REQUESTED v1 mapping."""

from __future__ import annotations

from aggregator.backend_contracts import to_backend_coaching_request
from aggregator.coaching import CoachingCommand
from aggregator.coaching_catalog import COACHING_MESSAGES


def test_converts_internal_v2_to_backend_v1_with_message_text() -> None:
    command = CoachingCommand(
        session_id="15",
        target_user_id="1",
        coaching_type="SILENCE_RECOVERY",
        message_key="SILENCE_RECOVERY_01",
        priority="LOW",
        reason_code="LONG_SILENCE",
        triggered_at_session_elapsed_ms=10_000,
        expires_at_session_elapsed_ms=15_000,
        deduplication_key="15:1:SILENCE_RECOVERY:10000",
        event_id="coaching-15-1-001",
        occurred_at="2026-07-30T10:00:10+00:00",
    )

    request = to_backend_coaching_request(command)
    payload = request.model_dump(by_alias=True, mode="json")

    assert command.version == 2
    assert payload["version"] == 1
    assert payload["eventType"] == "COACHING_REQUESTED"
    assert payload["source"] == "AI_SESSION_SERVER"
    assert payload["targetUserId"] == "1"
    assert payload["messageKey"] == "SILENCE_RECOVERY_01"
    assert payload["messageText"] == COACHING_MESSAGES[
        "SILENCE_RECOVERY_01"
    ]
    assert payload["expiresAtSessionElapsedMs"] == 15_000


def test_rejects_session_wide_command_without_target_user() -> None:
    command = CoachingCommand(
        session_id="15",
        target_user_id=None,
        coaching_type="SILENCE_RECOVERY",
        message_key="SILENCE_RECOVERY_01",
        priority="LOW",
        reason_code="LONG_SILENCE",
        triggered_at_session_elapsed_ms=10_000,
        expires_at_session_elapsed_ms=15_000,
        deduplication_key="15:session:SILENCE_RECOVERY:10000",
    )

    try:
        to_backend_coaching_request(command)
    except ValueError as error:
        assert "targetUserId" in str(error)
    else:
        raise AssertionError("target-less Backend request must be rejected")


def test_dynamic_message_text_overrides_catalog_without_changing_v1() -> None:
    command = CoachingCommand(
        session_id="15",
        target_user_id="1",
        coaching_type="SILENCE_RECOVERY",
        message_key="SILENCE_RECOVERY_01",
        message_text="제주도에서 기억에 남은 장소를 물어보세요.",
        priority="LOW",
        reason_code="LONG_SILENCE",
        triggered_at_session_elapsed_ms=10_000,
        expires_at_session_elapsed_ms=25_000,
        deduplication_key="15:1:SILENCE_RECOVERY:event-1",
    )

    request = to_backend_coaching_request(command)

    assert request.version == 1
    assert request.message_key == "SILENCE_RECOVERY_01"
    assert request.message_text == (
        "제주도에서 기억에 남은 장소를 물어보세요."
    )
