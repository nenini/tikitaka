"""STT v2 event parsing helpers for the control-room boundary."""

from __future__ import annotations

from collections.abc import Mapping

from pydantic import TypeAdapter
from stt.events import (
    SpeechEndedEvent,
    SpeechStartedEvent,
    SttEvent,
    TranscriptFinalizedEvent,
)

STT_EVENT_ADAPTER: TypeAdapter[SttEvent] = TypeAdapter(SttEvent)


def parse_stt_event(event: SttEvent | Mapping[str, object]) -> SttEvent:
    """Return a validated STT v2 event from a model or camelCase payload."""
    if isinstance(
        event,
        (SpeechStartedEvent, SpeechEndedEvent, TranscriptFinalizedEvent),
    ):
        return event
    return STT_EVENT_ADAPTER.validate_python(event)
