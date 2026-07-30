"""Session audio adapter seams.

The lifecycle/session layer depends on these small protocols rather than on
LiveKit directly, so contract tests can use an in-memory fake.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol

from stt.events import SttEvent

from aggregator.session_contracts import SessionEventRequest

SttEventSink = Callable[[SttEvent], Awaitable[bool]]
ElapsedMs = Callable[[], int]


class SessionAudioAdapter(Protocol):
    def start(self) -> None: ...

    async def stop(self) -> None: ...


class SessionAudioAdapterFactory(Protocol):
    async def warmup(self) -> None: ...

    def create(
        self,
        event: SessionEventRequest,
        sink: SttEventSink,
        elapsed_ms: ElapsedMs,
    ) -> SessionAudioAdapter: ...

    async def close(self) -> None: ...
