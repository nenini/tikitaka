"""Human-readable local sinks; replace these with BE adapters later."""

from __future__ import annotations

from aggregator.coaching import COACHING_TEMPLATES, CoachingCommand
from aggregator.events import AnalysisEvent


def console_emit(event: AnalysisEvent) -> None:
    who = event.speaker_id or "session"
    payload = event.payload.model_dump(by_alias=True)
    print(f"   →[관제실] {event.event_type} ({who}) {payload}")


def console_coaching_emit(command: CoachingCommand) -> None:
    who = command.target_user_id or "session"
    text = COACHING_TEMPLATES.get(command.message_key, command.message_key)
    ttl_ms = (
        command.expires_at_session_elapsed_ms
        - command.triggered_at_session_elapsed_ms
    )
    print(
        f'   →[코칭요청] {command.coaching_type} ({who}) "{text}" '
        f"[{command.reason_code}, TTL={ttl_ms}ms]"
    )
