"""Backend lifecycle -> active aggregator -> directed silence coaching."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path

import pytest
import aggregator.session_manager as session_manager_module
from stt.events import SttEvent, TranscriptFinalizedEvent, TranscriptPayload

from aggregator.backend_contracts import BackendCoachingReceipt
from aggregator.coaching import CoachingCommand
from aggregator.session_contracts import SessionEventRequest
from aggregator.session_manager import SessionManager
from aggregator.report.input import ReportInput
from aggregator.settings import IntegrationSettings
from aggregator.transcripts import TranscriptSegment
from aggregator.vision_backend import BackendVisionReceipt
from aggregator.vision_events import (
    VisionBehaviorEvent,
    VisionEventBatch,
)

_VISION_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


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


class FakeMessageGenerator:
    def __init__(self, message: str | None) -> None:
        self.message = message
        self.calls: list[tuple[tuple[TranscriptSegment, ...], str]] = []
        self.closed = False

    async def generate(
        self,
        segments: Sequence[TranscriptSegment],
        target_user_id: str,
    ) -> str | None:
        self.calls.append((tuple(segments), target_user_id))
        return self.message

    async def close(self) -> None:
        self.closed = True


class FakeAudioAdapter:
    def __init__(
        self,
        sink: Callable[[SttEvent], Awaitable[bool]],
        vision_sink: Callable[[VisionEventBatch], Awaitable[object]],
    ) -> None:
        self.sink = sink
        self.vision_sink = vision_sink
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
        vision_sink: Callable[[VisionEventBatch], Awaitable[object]],
        _elapsed_ms: Callable[[], int],
    ) -> FakeAudioAdapter:
        assert self.warmed
        adapter = FakeAudioAdapter(sink, vision_sink)
        self.adapters.append(adapter)
        return adapter

    async def close(self) -> None:
        self.closed = True


class FakeVisionSender:
    def __init__(self) -> None:
        self.events: list[tuple[VisionBehaviorEvent, str]] = []
        self.closed = False

    async def send(
        self,
        event: VisionBehaviorEvent,
        participant_identity: str,
    ) -> BackendVisionReceipt:
        self.events.append((event, participant_identity))
        return BackendVisionReceipt(
            event_id=str(event.event_id),
            status="STORED",
        )

    async def close(self) -> None:
        self.closed = True


class FakeReportPublisher:
    def __init__(self) -> None:
        self.analyses: list[dict[str, object]] = []
        self.reports: list[dict[str, object]] = []
        self.closed = False

    async def publish_analysis(
        self,
        payload: dict[str, object],
        *,
        idempotency_key: str,
    ) -> bool:
        self.analyses.append(payload)
        return False

    async def publish_report(
        self,
        payload: dict[str, object],
        *,
        idempotency_key: str,
    ) -> int:
        self.reports.append(payload)
        return 1

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


def test_report_concurrency_is_limited_to_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        active = 0
        maximum = 0

        async def fake_report_job(*args: object, **kwargs: object) -> None:
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0.01)
            active -= 1

        monkeypatch.setattr(
            session_manager_module,
            "run_report_job",
            fake_report_job,
        )
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                report_max_concurrency=1,
            ),
            sender=FakeSender(),
            audio_adapter_factory=FakeAudioAdapterFactory(),
            report_publisher=FakeReportPublisher(),  # type: ignore[arg-type]
        )
        snapshot = ReportInput("15", 1_000, (), (), False)
        ended_at = datetime(2026, 7, 30, tzinfo=timezone.utc)

        await asyncio.gather(
            manager._run_report(snapshot, 15, {}, ended_at),
            manager._run_report(snapshot, 16, {}, ended_at),
        )

        assert maximum == 1
        await manager.close()

    asyncio.run(scenario())


def test_shutdown_cancels_report_after_configured_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        started = asyncio.Event()

        async def hanging_report_job(*args: object, **kwargs: object) -> None:
            started.set()
            await asyncio.Future()

        monkeypatch.setattr(
            session_manager_module,
            "run_report_job",
            hanging_report_job,
        )
        publisher = FakeReportPublisher()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                report_shutdown_timeout_seconds=0.01,
            ),
            sender=FakeSender(),
            audio_adapter_factory=FakeAudioAdapterFactory(),
            report_publisher=publisher,  # type: ignore[arg-type]
        )
        task = asyncio.create_task(
            manager._run_report(
                ReportInput("15", 1_000, (), (), False),
                15,
                {},
                datetime(2026, 7, 30, tzinfo=timezone.utc),
            )
        )
        manager._report_tasks.add(task)
        task.add_done_callback(manager._report_done)
        await started.wait()

        await manager.close()

        assert task.cancelled()
        assert publisher.closed

    asyncio.run(scenario())


def test_lifecycle_is_idempotent_and_cleans_up_session() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        report_publisher = FakeReportPublisher()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
            report_publisher=report_publisher,  # type: ignore[arg-type]
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
        assert report_publisher.closed
        assert sender.closed
        assert audio_factory.closed

    asyncio.run(scenario())


def test_ten_second_silence_coaches_last_speakers_counterpart() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        message_generator = FakeMessageGenerator(
            "최근에는 어떤 활동에 가장 관심이 있으세요?"
        )
        audio_factory = FakeAudioAdapterFactory()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
                coaching_llm_enabled=True,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
            message_generator=message_generator,
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
        assert len(silence) == 1
        assert silence[0].target_user_id == "2"
        assert all(command.version == 2 for command in silence)
        assert all(
            command.message_text == "최근에는 어떤 활동에 가장 관심이 있으세요?"
            for command in silence
        )
        assert len(message_generator.calls) == 1
        segments, target_user_id = message_generator.calls[0]
        assert segments[0].text == "반갑습니다."
        assert target_user_id == "2"
        assert all(
            command.expires_at_session_elapsed_ms
            - command.triggered_at_session_elapsed_ms
            == 15_000
            for command in silence
        )
        await manager.close()
        assert message_generator.closed

    asyncio.run(scenario())


def test_livekit_adapter_routes_transcript_into_runtime() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        report_publisher = FakeReportPublisher()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
            report_publisher=report_publisher,  # type: ignore[arg-type]
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


def test_transcript_is_retained_after_end_and_expires_from_memory(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def scenario() -> None:
        current = datetime(
            2026,
            7,
            30,
            10,
            0,
            tzinfo=timezone.utc,
        )

        def now() -> datetime:
            return current

        sender = FakeSender()
        audio_factory = FakeAudioAdapterFactory()
        report_publisher = FakeReportPublisher()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
                transcript_retention_seconds=10,
                transcript_cleanup_interval_seconds=3600,
                transcript_debug_log=True,
            ),
            sender=sender,
            audio_adapter_factory=audio_factory,
            report_publisher=report_publisher,  # type: ignore[arg-type]
            now=now,
        )
        await manager.startup()
        await manager.handle(_started())
        event = TranscriptFinalizedEvent(
            session_id="15",
            user_id="1",
            participant_identity="user-1",
            client_instance_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            utterance_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            seq=1,
            session_elapsed_ms=2_000,
            confidence=0.91,
            payload=TranscriptPayload(
                text="메모리에 남는 문장",
                language="ko",
                segment_start_ms=1_000,
                segment_end_ms=2_000,
            ),
        )
        assert await manager.runtime("15").push_stt_event(event)

        active_segment = (
            manager.runtime("15")
            .aggregator.state.transcript_buffer
            .ordered_segments()[0]
        )
        assert active_segment.utterance_id == event.utterance_id
        assert active_segment.participant_identity == "user-1"
        assert active_segment.confidence == 0.91

        await manager.handle(_ended())
        retained = manager.retained_transcript("15")
        assert retained is not None
        assert retained.segment_count == 1
        assert retained.segments[0] == active_segment
        assert manager.active_session_count == 0
        assert manager.retained_transcript_count == 1

        current = datetime(
            2026,
            7,
            30,
            10,
            0,
            11,
            tzinfo=timezone.utc,
        )
        assert manager.retained_transcript("15") is None
        assert manager.retained_transcript_count == 0
        await manager.close()
        assert len(report_publisher.analyses) == 1
        # 리포트는 세션당 한 번만 보낸다(BE 계약 2026-08-04). 참가자는 배열에 담긴다.
        assert len(report_publisher.reports) == 1
        entries = report_publisher.reports[0]["reports"]
        assert isinstance(entries, list)
        assert len(entries) == 2

    caplog.set_level(logging.INFO)
    asyncio.run(scenario())
    messages = [record.message for record in caplog.records]
    assert any(
        "transcript stored" in message
        and "메모리에 남는 문장" in message
        for message in messages
    )
    assert any("transcript retained" in message for message in messages)
    assert any(
        "transcript expired and deleted" in message
        for message in messages
    )


def test_livekit_adapter_routes_important_vision_event_to_backend() -> None:
    async def scenario() -> None:
        sender = FakeSender()
        vision_sender = FakeVisionSender()
        audio_factory = FakeAudioAdapterFactory()
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=3600,
            ),
            sender=sender,
            vision_sender=vision_sender,
            audio_adapter_factory=audio_factory,
        )
        await manager.startup()
        await manager.handle(_started())

        with (
            _VISION_FIXTURE_DIR / "vision-behavior-event.valid.json"
        ).open(encoding="utf-8") as fixture_file:
            raw = json.load(fixture_file)
        raw["sessionId"] = "15"
        raw["userId"] = "1"
        batch = VisionEventBatch.model_validate(
            {
                "behaviorEvents": [raw],
                "metricSnapshots": [],
            }
        )
        await audio_factory.adapters[0].vision_sink(batch)
        await manager.runtime("15").wait_until_delivered()

        assert len(vision_sender.events) == 1
        stored_event, identity = vision_sender.events[0]
        assert stored_event.event_type == "GAZE_AWAY_STARTED"
        assert identity == "user-1"
        await manager.close()
        assert vision_sender.closed

    asyncio.run(scenario())
