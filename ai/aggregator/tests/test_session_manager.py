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
from aggregator.session_manager import SessionManager, SessionNotActiveError
from aggregator.task_guard import log_task_failure
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
        self.warmups = 0

    async def warmup(self) -> None:
        self.warmups += 1

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
        # 침묵 판정 보류 게이트가 읽는다. 테스트가 직접 올려 시나리오를 만든다.
        self.pending_transcripts = 0

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


def test_session_end_survives_a_failing_stop() -> None:
    """stop() 이 터져도 전사 보관·리포트 예약은 반드시 시도한다.

    2026-08-06 운영: stop() 안의 SttSequenceError 가 그대로 올라가 _end() 아래가
    통째로 스킵됐다. 전사 조회 404, 리포트 로그 0건, 실패 통지도 못 감 →
    프론트는 무한 PENDING. 세션은 이미 끝났으니 남은 데이터를 건지는 게 먼저다.
    """

    class ExplodingAdapter(FakeAudioAdapter):
        async def stop(self) -> None:
            raise RuntimeError("seq regression during flush")

    class ExplodingFactory(FakeAudioAdapterFactory):
        def create(
            self,
            _event: SessionEventRequest,
            sink: Callable[[SttEvent], Awaitable[bool]],
            vision_sink: Callable[[VisionEventBatch], Awaitable[object]],
            _elapsed_ms: Callable[[], int],
        ) -> FakeAudioAdapter:
            assert self.warmed
            adapter = ExplodingAdapter(sink, vision_sink)
            self.adapters.append(adapter)
            return adapter

    async def scenario() -> None:
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
            ),
            sender=FakeSender(),
            audio_adapter_factory=ExplodingFactory(),
        )
        await manager.startup()
        try:
            await manager.handle(_started())
            response = await manager.handle(_ended())
            assert response.status == "PROCESSED", "예외가 새면 BE가 500을 받는다"
            assert "15" not in manager._sessions, "세션은 정리돼야 한다"
        finally:
            await manager.close()

    asyncio.run(scenario())


def test_tick_loop_keeps_running_after_a_failing_tick() -> None:
    """tick 이 한 번 터져도 루프는 계속 돈다.

    예전엔 try 가 while 바깥이라 예외 하나에 tick 이 영영 멈췄다. tick 이 멈추면
    침묵·리액션 감지가 통째로 죽어 세션 내내 코칭이 한 건도 안 나간다.
    """

    async def scenario() -> None:
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                tick_interval_seconds=0.01,
            ),
            sender=FakeSender(),
            audio_adapter_factory=FakeAudioAdapterFactory(),
        )
        await manager.startup()
        try:
            await manager.handle(_started())
            ticks = 0

            async def exploding_tick(_elapsed_ms: int | None = None) -> None:
                nonlocal ticks
                ticks += 1
                raise RuntimeError("detector blew up")

            manager.runtime("15").tick = exploding_tick  # type: ignore[assignment]
            await asyncio.sleep(0.1)
            assert ticks >= 3, "한 번 실패했다고 tick 이 멈추면 코칭이 죽는다"
        finally:
            await manager.close()

    asyncio.run(scenario())


def test_retention_loop_keeps_running_after_a_failing_sweep() -> None:
    """보관 만료 청소가 한 번 터져도 루프는 계속 돈다.

    예전엔 CancelledError 만 잡아서 다른 예외가 나면 루프가 조용히 죽었다. 그러면
    전사가 영원히 안 지워진다 — "종료 후 30분만 보관" 약속이 깨진다.
    """

    async def scenario() -> None:
        manager = SessionManager(
            IntegrationSettings(
                internal_token="token",
                backend_base_url="http://backend:8080",
                transcript_cleanup_interval_seconds=0.01,
            ),
            sender=FakeSender(),
            audio_adapter_factory=FakeAudioAdapterFactory(),
        )
        sweeps = 0

        def exploding_purge() -> None:
            nonlocal sweeps
            sweeps += 1
            raise RuntimeError("clock blew up")

        manager._purge_expired_transcripts = exploding_purge  # type: ignore[method-assign]
        await manager.startup()
        try:
            await asyncio.sleep(0.1)
            assert sweeps >= 3, "청소가 죽으면 전사가 영영 안 지워진다"
        finally:
            await manager.close()

    asyncio.run(scenario())


def test_failed_background_task_is_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """던지고 잊는 태스크의 예외는 반드시 로그로 남는다.

    2026-08-06 장애의 핵심은 "예외가 났는데 로그가 없었다" 였다.
    """

    async def scenario() -> None:
        async def boom() -> None:
            raise RuntimeError("silent death")

        task = asyncio.create_task(boom(), name="probe")
        task.add_done_callback(log_task_failure)
        await asyncio.gather(task, return_exceptions=True)
        await asyncio.sleep(0)

    with caplog.at_level(logging.ERROR):
        asyncio.run(scenario())

    assert any(
        "background task failed name=probe" in record.getMessage()
        for record in caplog.records
    )


# ── 요청형 질문 추천 (코칭 버튼) ─────────────────────────────────────
def _transcript(text: str) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id="15",
        user_id="1",
        participant_identity="user-1",
        client_instance_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        utterance_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        seq=1,
        session_elapsed_ms=1000,
        confidence=0.9,
        payload=TranscriptPayload(
            text=text,
            language="ko",
            segment_start_ms=0,
            segment_end_ms=1000,
        ),
    )


async def _started_session(
    message: str | None,
) -> tuple[SessionManager, FakeSender, FakeMessageGenerator]:
    sender = FakeSender()
    generator = FakeMessageGenerator(message)
    manager = SessionManager(
        IntegrationSettings(
            internal_token="token",
            backend_base_url="http://backend:8080",
            tick_interval_seconds=3600,
            coaching_llm_enabled=True,
        ),
        sender=sender,
        audio_adapter_factory=FakeAudioAdapterFactory(),
        message_generator=generator,
    )
    await manager.startup()
    await manager.handle(_started())
    return manager, sender, generator


def test_question_suggestion_emits_manual_coaching() -> None:
    async def scenario() -> None:
        manager, sender, generator = await _started_session("어떤 영화 좋아하세요?")
        runtime = manager.runtime("15")
        await runtime.push_stt_event(_transcript("반갑습니다."))

        created = await manager.request_question_suggestion("15", "1", "req-1")
        await runtime.wait_until_delivered()

        assert created is True
        manual = [
            command
            for command in sender.commands
            if command.coaching_type == "QUESTION_SUGGESTION"
        ]
        assert len(manual) == 1
        assert manual[0].target_user_id == "1"
        assert manual[0].message_text == "어떤 영화 좋아하세요?"
        assert manual[0].reason_code == "USER_REQUESTED"
        # 자동 코칭과 겹치면 BE 중복 차단에 걸려 조용히 사라진다
        assert manual[0].deduplication_key == "manual:req-1"
        segments, target_user_id = generator.calls[0]
        assert segments[0].text == "반갑습니다."
        assert target_user_id == "1"
        await manager.close()

    asyncio.run(scenario())


def test_question_suggestion_sends_nothing_when_llm_gives_up() -> None:
    """고정 문구로 폴백하지 않는다 — 질문을 요청한 사람에게 격려가 가면 안 된다."""

    async def scenario() -> None:
        manager, sender, _ = await _started_session(None)
        runtime = manager.runtime("15")
        await runtime.push_stt_event(_transcript("반갑습니다."))

        created = await manager.request_question_suggestion("15", "1", "req-2")

        assert created is False
        assert sender.commands == []
        await manager.close()

    asyncio.run(scenario())


def test_question_suggestion_needs_something_to_talk_about() -> None:
    """세션 시작 직후 버튼을 누르는 일이 실제로 생긴다. 전사가 없으면 만들 수 없다."""

    async def scenario() -> None:
        manager, sender, generator = await _started_session("어떤 영화 좋아하세요?")

        created = await manager.request_question_suggestion("15", "1", "req-3")

        assert created is False
        assert sender.commands == []
        assert generator.calls == []  # LLM 을 부르지도 않는다
        await manager.close()

    asyncio.run(scenario())


def test_question_suggestion_on_unknown_session_raises() -> None:
    async def scenario() -> None:
        manager, _, _ = await _started_session("어떤 영화 좋아하세요?")
        with pytest.raises(SessionNotActiveError):
            await manager.request_question_suggestion("999", "1", "req-4")
        await manager.close()

    asyncio.run(scenario())
