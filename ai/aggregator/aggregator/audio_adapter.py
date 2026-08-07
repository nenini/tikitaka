"""Session audio adapter seams.

The lifecycle/session layer depends on these small protocols rather than on
LiveKit directly, so contract tests can use an in-memory fake.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol

from stt.events import SttEvent

from aggregator.session_contracts import SessionEventRequest
from aggregator.vision_events import VisionEventBatch

SttEventSink = Callable[[SttEvent], Awaitable[bool]]
VisionBatchSink = Callable[[VisionEventBatch], Awaitable[object]]
ElapsedMs = Callable[[], int]


class SessionAudioAdapter(Protocol):
    def start(self) -> None: ...

    async def stop(self) -> None: ...

    @property
    def pending_transcripts(self) -> int:
        """전사 대기 중인 발화 수. 0 이면 "지금 처리 중인 소리가 없다".

        침묵 판정이 이 값을 본다. VAD 가 연 소리가 말인지 아닌지는 전사가 끝나야
        알 수 있는데, 그 사이에 침묵으로 단정하면 방금 말한 사람에게 "대화가
        끊겼어요"가 나가고, 활동으로 치면 잡음 하나에 침묵이 영영 안 잡힌다.
        결론을 미루는 게 맞다.
        """
        ...


class SessionAudioAdapterFactory(Protocol):
    async def warmup(self) -> None: ...

    def create(
        self,
        event: SessionEventRequest,
        sink: SttEventSink,
        vision_sink: VisionBatchSink,
        elapsed_ms: ElapsedMs,
    ) -> SessionAudioAdapter: ...

    async def close(self) -> None: ...
