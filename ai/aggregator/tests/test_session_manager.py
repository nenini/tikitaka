"""Backend lifecycle -> active aggregator -> two-sided silence coaching."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from collections.abc import Awaitable, Callable

from stt.events import SttEvent, TranscriptFinalizedEvent, TranscriptPayload

from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
from aggregator.session_contracts import SessionEventRequest
from aggregator.session_manager import SessionManager
from aggregator.settings import IntegrationSettings


class FakeSender:
    def __init__(self) -> None:
        self.commands: list[CoachingCommand] = []
        self.closed = False

    async def send(
        self,
        command: CoachingCommand,
    ) -> BackendCoachingReceipt:
        self.commands.append(command)
        return BackendCoachingReceipt(
            event_id=command.event_id,
            status="DELIVERED",
        )

    async def close(self) -> None:
        self.closed = True


class FakeAudioAdapter:
    def __init__(
        self,
        sink: Callable[[SttEvent], Awaitable[bool]],
    ) -> None:
        self.sink = sink
        self.started = False
        self.stopped = False

    def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True


class FakeAudioAdapterFactory:
    def __init__(self) -> None:
        self.warmed = False
        self.closed = False
        self.adapters: list[FakeAudioAdapter] = []

    async def warmup(self) -> None:
        self.warmed = True

    def create(
        self,
        _event: SessionEventRequest,
        sink: Callable[[SttEvent], Awaitable[bool]],
        _elapsed_ms: Callable[[], int],
    ) -> FakeAudioAdapter:
        assert self.warmed
        adapter = FakeAudioAdapter(sink)
        self.adapters.append(adapter)
        return adapter

    async def close(self) -> None:
        self.closed = True


def _started() -> SessionEventRequest:
    return SessionEventRequest.model_validate(
        {
            "eventId": "session-15-ai-session-started",
            "eventType": "AI_SESSION_STARTED",
            "version": 1,
            "sessionId": "15",
            "actualStartAt": "2026-07-30T10:00:00Z",
            "participants": [
                {
                    "userId": "1",
                    "participantIdentity": "user-1",
                    "sttEnabled": True,
                    "visionEnabled": True,
                },
                {
                    "userId": "2",
                    "participantIdentity": "user-2",
                    "sttEnabled": True,
                    "visionEnabled": True,
                },
            ],
            "features": {
                "sttEnabled": True,
                "visionEnabled": True,
                "coachingEnabled": True,
            },
            "liveKit": {
                "url": "wss://livekit.example.test",
                "roomName": "session-15",
                "accessToken": "secret-room-token",
                "participantIdentity": "ai-session-15",
            },
        }
    )


def _ended() -> SessionEventRequest:
    return SessionEventRequest.model_validate(
        {
            "eventId": "session-15-ai-session-ended",
            "eventType": "AI_SESSION_ENDED",
            "version": 1,
            "sessionId": "15",
            "endedAt": "2026-07-30T10:30:00Z",
            "reason": "TIMEOUT",
        }
    )


def test_lifecycle_is_idempotent_and_cleans_up_session() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
            now=lambda: datetime(
                2026,
                7,
                30,
                10,
                0,
                tzinfo=timezone.utc,
            ),
        )
        await manager.startup()
        first = await manager.handle(_started())
        duplicate = await manager.handle(_started())
        assert first.status == "PROCESSED"
        assert duplicate.status == "DUPLICATE"
        assert manager.active_session_count == 1
        assert audio_factory.adapters[0].started

        ended = await manager.handle(_ended())
        assert ended.status == "PROCESSED"
        assert manager.active_session_count == 0
        assert audio_factory.adapters[0].stopped
        await manager.close()
        assert sender.closed
        assert audio_factory.closed

    asyncio.run(scenario())


def test_ten_second_silence_delivers_one_coaching_per_user() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
        )
        await manager.startup()
        await manager.handle(_started())
        runtime = manager.runtime("15")
        await runtime.push_stt_event(
            TranscriptFinalizedEvent(
                session_id="15",
                user_id="1",
                participant_identity="user-1",
                client_instance_id=(
                    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                ),
                utterance_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                seq=1,
                session_elapsed_ms=1000,
                confidence=0.9,
                payload=TranscriptPayload(
                    text="반갑습니다.",
                    language="ko",
                    segment_start_ms=0,
                    segment_end_ms=1000,
                ),
            )
        )

        await runtime.tick(11_000)
        await runtime.wait_until_delivered()

        silence = [
            command
            for command in sender.commands
            if command.coaching_type == "SILENCE_RECOVERY"
        ]
        assert len(silence) == 2
        assert {command.target_user_id for command in silence} == {"1", "2"}
        assert all(command.version == 2 for command in silence)
        assert all(
            command.expires_at_session_elapsed_ms
            - command.triggered_at_session_elapsed_ms
            == 5000
            for command in silence
        )
        await manager.close()

    asyncio.run(scenario())


def test_livekit_adapter_routes_transcript_into_runtime() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
        )
        await manager.startup()
        await manager.handle(_started())

        accepted = await audio_factory.adapters[0].sink(
            TranscriptFinalizedEvent(
                session_id="15",
                user_id="1",
                participant_identity="user-1",
                client_instance_id=(
                    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                ),
                utterance_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                seq=1,
                session_elapsed_ms=1000,
                confidence=0.9,
                payload=TranscriptPayload(
                    text="실제 어댑터 경로입니다.",
                    language="ko",
                    segment_start_ms=0,
                    segment_end_ms=1000,
                ),
            )
        )

        assert accepted
        assert (
            manager.runtime("15")
            .aggregator.state.speaker("1")
            .utterances[0]
            .text
            == "실제 어댑터 경로입니다."
        )
        await manager.close()

    asyncio.run(scenario())
