"""LiveKit remote audio tracks -> own VAD/STT -> SessionRuntime events."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from typing import TYPE_CHECKING, cast

import numpy as np
from livekit import rtc

from stt.events import SttEvent
from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.session import SessionSttRunner, make_vad_options

from aggregator.audio_adapter import (
    ElapsedMs,
    SessionAudioAdapter,
    SttEventSink,
    VisionBatchSink,
)
from aggregator.livekit_vision import LiveKitVisionAdapter
from aggregator.session_contracts import SessionEventRequest
from aggregator.settings import IntegrationSettings

if TYPE_CHECKING:
    from livekit.rtc import AudioTrack, RemoteParticipant, RemoteTrackPublication

logger = logging.getLogger(__name__)

FEED_BATCH_MS = 100
"""VAD에 넘기기 전에 모으는 오디오 길이. LiveKit 프레임은 20ms 단위다.

100ms면 VAD 호출이 1/5로 줄고, 발화 시작 감지가 최대 80ms 늦어진다. 코칭·리포트가
초 단위로 판정하므로 그 지연은 무해하다. 더 키우면 바지인(AI 말 끊기) 반응이 둔해진다.
"""


class LiveKitSttAdapterFactory:
    """Load one Whisper engine and share it across all active sessions."""

    def __init__(self, settings: IntegrationSettings) -> None:
        self._settings = settings
        self._engine: SttEngine | None = None
        self._engine_lock = asyncio.Lock()

    async def warmup(self) -> None:
        if self._engine is not None:
            return
        async with self._engine_lock:
            if self._engine is None:
                logger.info(
                    "warming STT engine model=%s device=%s",
                    self._settings.stt_model_size,
                    self._settings.stt_device,
                )
                self._engine = await asyncio.to_thread(
                    SttEngine,
                    model_size=self._settings.stt_model_size,
                    device=self._settings.stt_device,
                    compute_type=self._settings.stt_compute_type,
                    language=self._settings.stt_language,
                )
                logger.info(
                    "STT engine ready device=%s",
                    self._engine.device,
                )

    def create(
        self,
        event: SessionEventRequest,
        sink: SttEventSink,
        vision_sink: VisionBatchSink,
        elapsed_ms: ElapsedMs,
    ) -> SessionAudioAdapter:
        if self._engine is None:
            raise RuntimeError("STT engine must be warmed before session start")
        return LiveKitSttAdapter(
            event=event,
            engine=self._engine,
            settings=self._settings,
            sink=sink,
            vision_sink=vision_sink,
            elapsed_ms=elapsed_ms,
        )

    async def close(self) -> None:
        self._engine = None


class LiveKitSttAdapter:
    """Join one LiveKit room and keep each participant's audio isolated."""

    def __init__(
        self,
        *,
        event: SessionEventRequest,
        engine: SttEngine,
        settings: IntegrationSettings,
        sink: SttEventSink,
        vision_sink: VisionBatchSink,
        elapsed_ms: ElapsedMs,
    ) -> None:
        if event.live_kit is None:
            raise ValueError("liveKit connection is required")
        self._event = event
        self._connection = event.live_kit
        self._sink = sink
        self._elapsed_ms = elapsed_ms
        self._room = rtc.Room()
        self._vision_adapter = LiveKitVisionAdapter(
            event=event,
            sink=vision_sink,
        )
        self._runner = SessionSttRunner(
            engine,
            session_id=event.session_id,
            vad_opts=make_vad_options(
                threshold=settings.stt_vad_threshold,
                end_silence_ms=settings.stt_end_silence_ms,
            ),
            end_silence_ms=settings.stt_end_silence_ms,
            min_confidence=settings.stt_min_confidence,
            max_pending=settings.stt_max_pending,
            session_epoch_ms=elapsed_ms(),
        )
        self._participants = {
            participant.participant_identity: participant
            for participant in event.participants or []
            if participant.stt_enabled
            and (event.features is None or event.features.stt_enabled)
        }
        self._track_tasks: dict[str, asyncio.Task[None]] = {}
        self._main_task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()
        self._connected = asyncio.Event()
        self._vision_adapter.register(self._room)
        self._register_room_handlers()

    def start(self) -> None:
        self._main_task = asyncio.create_task(
            self._run(),
            name=f"livekit-stt-{self._event.session_id}",
        )

    async def stop(self) -> None:
        self._stopping.set()
        for task in self._track_tasks.values():
            task.cancel()
        if self._track_tasks:
            await asyncio.gather(
                *self._track_tasks.values(),
                return_exceptions=True,
            )
        self._track_tasks.clear()

        if self._connected.is_set():
            await self._room.disconnect()
        if self._main_task is not None:
            self._main_task.cancel()
            await asyncio.gather(self._main_task, return_exceptions=True)

        # close()가 남은 전사까지 seq 오름차순으로 돌려준다. 여기서 poll을 또 부르면
        # 안 된다 — 예전에 그렇게 했다가 seq 역행으로 종료 처리가 통째로 끊겼다.
        final_events = await asyncio.to_thread(self._runner.close)
        await self._forward(final_events)
        await self._vision_adapter.close()

    def _register_room_handlers(self) -> None:
        @self._room.on("track_subscribed")
        def on_track_subscribed(
            track: AudioTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
        ) -> None:
            self._start_audio_track(track, publication, participant)

        @self._room.on("track_unsubscribed")
        def on_track_unsubscribed(
            _track: AudioTrack,
            publication: RemoteTrackPublication,
            _participant: RemoteParticipant,
        ) -> None:
            task = self._track_tasks.pop(publication.sid, None)
            if task is not None:
                task.cancel()

        @self._room.on("disconnected")
        def on_disconnected(reason: object) -> None:
            if not self._stopping.is_set():
                logger.warning(
                    "LiveKit disconnected session=%s reason=%s",
                    self._event.session_id,
                    reason,
                )

    async def _run(self) -> None:
        try:
            await self._room.connect(
                self._connection.url,
                self._connection.access_token.get_secret_value(),
                options=rtc.RoomOptions(auto_subscribe=True),
            )
            if self._room.name != self._connection.room_name:
                raise RuntimeError(
                    "connected LiveKit room does not match lifecycle roomName"
                )
            if (
                self._room.local_participant.identity
                != self._connection.participant_identity
            ):
                raise RuntimeError(
                    "LiveKit token identity does not match "
                    "lifecycle participantIdentity"
                )
            self._connected.set()
            for participant in self._room.remote_participants.values():
                for publication in participant.track_publications.values():
                    if (
                        publication.track is not None
                        and publication.track.kind
                        == rtc.TrackKind.KIND_AUDIO
                    ):
                        self._start_audio_track(
                            cast("AudioTrack", publication.track),
                            publication,
                            participant,
                        )
            logger.info(
                "LiveKit session connected session=%s room=%s "
                "sttParticipants=%d visionEnabled=%s",
                self._event.session_id,
                self._connection.room_name,
                len(self._participants),
                self._vision_adapter.enabled,
            )
            poll_task = asyncio.create_task(
                self._poll_transcripts(),
                name=f"stt-poll-{self._event.session_id}",
            )
            await self._stopping.wait()
            poll_task.cancel()
            await asyncio.gather(poll_task, return_exceptions=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "LiveKit STT worker failed session=%s room=%s",
                self._event.session_id,
                self._connection.room_name,
            )
            if (
                self._room.connection_state
                != rtc.ConnectionState.CONN_DISCONNECTED
            ):
                await self._room.disconnect()

    def _start_audio_track(
        self,
        track: AudioTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
    ) -> None:
        if publication.sid in self._track_tasks:
            return
        session_participant = self._participants.get(participant.identity)
        if session_participant is None:
            logger.warning(
                "ignored unexpected/non-STT participant session=%s identity=%s",
                self._event.session_id,
                participant.identity,
            )
            return
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if publication.source != rtc.TrackSource.SOURCE_MICROPHONE:
            logger.debug(
                "ignored non-microphone audio session=%s identity=%s source=%s",
                self._event.session_id,
                participant.identity,
                publication.source,
            )
            return
        self._track_tasks[publication.sid] = asyncio.create_task(
            self._consume_audio(
                track,
                publication.sid,
                session_participant.user_id,
                participant.identity,
                self._elapsed_ms(),
            ),
            name=(
                f"livekit-audio-{self._event.session_id}-"
                f"{session_participant.user_id}"
            ),
        )
        logger.info(
            "audio track subscribed session=%s user=%s identity=%s track=%s",
            self._event.session_id,
            session_participant.user_id,
            participant.identity,
            publication.sid,
        )

    async def _consume_audio(
        self,
        track: AudioTrack,
        track_sid: str,
        user_id: str,
        participant_identity: str,
        stream_epoch_ms: int,
    ) -> None:
        stream = rtc.AudioStream(
            track,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            frame_size_ms=20,
            capacity=100,
        )
        # 프레임을 묶어서 스레드로 넘긴다. `feed()`는 Whisper가 아니라 **VAD**를 돌리는데
        # (Whisper는 worker 스레드에 있다) 버퍼 전체를 매번 다시 훑기 때문에 발화가
        # 길어질수록 비싸진다 — 실측 8초 버퍼에서 14.6ms로, 20ms 프레임 예산의 73%다.
        # 화자 2명이면 예산을 넘겨 이벤트 루프가 밀리고, 코칭 LLM 응답이 도착해도
        # 집어들 틈이 없어 3초 타임아웃에 걸린다(2026-08-06 운영: 9/9 폴백).
        #
        # 묶으면 VAD 호출이 1/5로 줄고, to_thread 로 빼면 남은 비용도 루프 밖으로 나간다.
        # 스레드 왕복 비용은 5프레임에 한 번이라 상쇄된다.
        pending: list[np.ndarray] = []
        pending_samples = 0
        batch_samples = SAMPLE_RATE * FEED_BATCH_MS // 1000
        try:
            async for frame_event in stream:
                pcm = np.frombuffer(
                    frame_event.frame.data,
                    dtype=np.int16,
                ).astype(np.float32)
                pcm /= 32768.0
                pending.append(pcm)
                pending_samples += len(pcm)
                if pending_samples < batch_samples:
                    continue
                chunk = np.concatenate(pending)
                pending.clear()
                pending_samples = 0
                events = await asyncio.to_thread(
                    self._runner.feed,
                    user_id=user_id,
                    participant_identity=participant_identity,
                    audio=chunk,
                    stream_epoch_ms=stream_epoch_ms,
                )
                await self._forward(events)

            # 트랙이 끊기면 배치에 못 찬 꼬리가 남는다. 버리면 마지막 발화의 끝이
            # 잘린다 — 최대 80ms지만 종결 어미가 날아갈 수 있다.
            if pending:
                events = await asyncio.to_thread(
                    self._runner.feed,
                    user_id=user_id,
                    participant_identity=participant_identity,
                    audio=np.concatenate(pending),
                    stream_epoch_ms=stream_epoch_ms,
                )
                pending.clear()
                await self._forward(events)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "LiveKit audio consumer failed session=%s user=%s track=%s",
                self._event.session_id,
                user_id,
                track_sid,
            )
        finally:
            await stream.aclose()

    async def _poll_transcripts(self) -> None:
        while not self._stopping.is_set():
            await self._forward(self._runner.poll_transcripts())
            await asyncio.sleep(0.05)

    async def _forward(self, events: Sequence[SttEvent]) -> None:
        for event in events:
            log = (
                logger.info
                if event.event_type == "TRANSCRIPT_FINALIZED"
                else logger.debug
            )
            log(
                "STT event session=%s user=%s type=%s elapsedMs=%d",
                event.session_id,
                event.user_id,
                event.event_type,
                event.session_elapsed_ms,
            )
            accepted = await self._sink(event)
            if not accepted:
                logger.warning(
                    "aggregator rejected STT event session=%s eventId=%s",
                    self._event.session_id,
                    event.event_id,
                )
