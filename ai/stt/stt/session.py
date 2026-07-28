"""화자별 STT 스트림 멀티플렉싱 (STT-04, v2 계약 = 요구사항.md).

- SpeakerStream: 한 화자의 VAD 버퍼 + 엔드포인팅 상태머신. 발화마다 utteranceId 하나를
  SPEECH_STARTED(온셋)·SPEECH_ENDED(종료)·TRANSCRIPT_FINALIZED가 공유한다.
- SessionSttRunner: 공유 엔진 + 비동기 전사 worker 위에서 여러 화자를 관리한다.

시간축: 관찰 발화 시각(observedStart/End)은 오디오 샘플 위치(monotonic)로, 이벤트 생성 시각
(sessionElapsedMs)은 SPEECH=감지 시점의 오디오 위치·TRANSCRIPT=전사 완료 시각(worker clock)으로.
seq는 종류 무관 (sessionId, userId, clientInstanceId)에서 단조 증가(worker가 카운터 소유).
식별자(userId·participantIdentity)와 세션 anchor는 BE가 주입한다.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from typing import Dict, List

import numpy as np
from faster_whisper.vad import VadOptions, get_speech_timestamps

from stt.events import (
    SpeechEndedEvent,
    SpeechEndedPayload,
    SpeechStartedEvent,
    SpeechStartedPayload,
    SttEvent,
    TerminationReason,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)
from stt.pipeline import SAMPLE_RATE, SttEngine
from stt.transcription import TranscriptionJob, TranscriptionWorker

MAX_BUFFER_SECONDS = 25.0

StreamEvent = SttEvent


def make_vad_options(
    threshold: float = 0.5,
    end_silence_ms: int = 700,
    max_utterance_s: float = 20.0,
) -> VadOptions:
    return VadOptions(
        threshold=threshold,
        min_silence_duration_ms=end_silence_ms,
        min_speech_duration_ms=250,
        max_speech_duration_s=max_utterance_s,
        speech_pad_ms=200,
    )


class SpeakerStream:
    """한 화자의 오디오를 받아 발화 단위로 VAD·STT하여 v2 이벤트를 낸다."""

    def __init__(
        self,
        engine: SttEngine,
        *,
        session_id: str,
        user_id: str,
        participant_identity: str,
        vad_opts: VadOptions,
        stream_epoch_ms: int = 0,
        client_instance_id: str | None = None,
        end_silence_ms: int = 700,
        min_confidence: float = 0.5,
        vad_confidence: float = 0.9,  # VAD는 스칼라 신뢰도를 안 줘서 명목값 사용
        submit_transcription: Callable[[TranscriptionJob], None] | None = None,
        next_seq: Callable[[str], int] | None = None,
    ) -> None:
        self.engine = engine
        self.session_id = session_id
        self.user_id = user_id
        self.participant_identity = participant_identity
        self.client_instance_id = client_instance_id or str(uuid.uuid4())
        self.stream_epoch_ms = stream_epoch_ms
        self.vad_opts = vad_opts
        self.min_confidence = min_confidence
        self.vad_confidence = vad_confidence
        self._submit = submit_transcription  # None=동기 전사, 있으면 worker 제출
        self._external_next_seq = next_seq
        self._local_seq: Dict[str, int] = {}  # 동기 모드용 통합 seq
        self._end_silence_samples = int(SAMPLE_RATE * end_silence_ms / 1000)
        self._max_buffer_samples = int(SAMPLE_RATE * MAX_BUFFER_SECONDS)
        self._buffer: np.ndarray = np.empty(0, dtype=np.float32)
        self._offset = 0
        self._speaking = False
        self._withdrawn = False
        self._utterance_id = ""
        self._observed_start_ms = 0

    def _elapsed_ms(self, sample_pos: int) -> int:
        return self.stream_epoch_ms + int(sample_pos / SAMPLE_RATE * 1000)

    def _now_pos_ms(self) -> int:
        """현재 오디오 위치(=이벤트 생성 시각). 버퍼 끝 = 지금까지 받은 오디오."""
        return self._elapsed_ms(self._offset + len(self._buffer))

    def _next_seq(self) -> int:
        if self._external_next_seq is not None:
            return self._external_next_seq(self.client_instance_id)
        n = self._local_seq.get(self.client_instance_id, 0) + 1
        self._local_seq[self.client_instance_id] = n
        return n

    def _ids(self) -> dict[str, str]:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "participant_identity": self.participant_identity,
            "client_instance_id": self.client_instance_id,
            "utterance_id": self._utterance_id,
        }

    def _speech_started(self, created_ms: int) -> SpeechStartedEvent:
        return SpeechStartedEvent(
            **self._ids(),
            seq=self._next_seq(),
            session_elapsed_ms=created_ms,
            confidence=self.vad_confidence,
            payload=SpeechStartedPayload(observed_start_elapsed_ms=self._observed_start_ms),
        )

    def _speech_ended(
        self, created_ms: int, observed_end_ms: int, reason: TerminationReason
    ) -> SpeechEndedEvent:
        return SpeechEndedEvent(
            **self._ids(),
            seq=self._next_seq(),
            session_elapsed_ms=created_ms,
            confidence=self.vad_confidence,
            payload=SpeechEndedPayload(
                observed_start_elapsed_ms=self._observed_start_ms,
                observed_end_elapsed_ms=observed_end_ms,
                speech_duration_ms=observed_end_ms - self._observed_start_ms,
                termination_reason=reason,
            ),
        )

    def _emit_transcript(
        self, events: List[StreamEvent], utterance: np.ndarray, observed_end_ms: int
    ) -> None:
        # 비동기: worker 제출(TRANSCRIPT는 나중에 poll). 동기: 즉시 전사해 events에 추가.
        if self._submit is not None:
            self._submit(
                TranscriptionJob(
                    audio=utterance,
                    session_id=self.session_id,
                    user_id=self.user_id,
                    participant_identity=self.participant_identity,
                    client_instance_id=self.client_instance_id,
                    utterance_id=self._utterance_id,
                    observed_start_ms=self._observed_start_ms,
                    observed_end_ms=observed_end_ms,
                    min_confidence=self.min_confidence,
                )
            )
            return
        pieces = self.engine.transcribe_chunk(
            utterance, base_ms=self._observed_start_ms, vad_filter=False,
            min_confidence=self.min_confidence,
        )
        if not pieces:
            return
        events.append(
            TranscriptFinalizedEvent(
                **self._ids(),
                seq=self._next_seq(),
                session_elapsed_ms=observed_end_ms,  # 동기: 완료 ≈ 발화 종료
                confidence=min(p.confidence for p in pieces),
                payload=TranscriptPayload(
                    text=" ".join(p.text for p in pieces),
                    language=pieces[0].language,
                    segment_start_ms=self._observed_start_ms,
                    segment_end_ms=observed_end_ms,
                ),
            )
        )

    def feed(self, audio: np.ndarray) -> List[StreamEvent]:
        if self._withdrawn:
            return []  # 동의 철회됨 — 입력 무시
        self._buffer = np.concatenate([self._buffer, audio])
        events: List[StreamEvent] = []

        segments = get_speech_timestamps(self._buffer, self.vad_opts)
        if not segments:
            if len(self._buffer) > SAMPLE_RATE * 2:
                drop = len(self._buffer) - SAMPLE_RATE
                self._buffer = self._buffer[drop:]
                self._offset += drop
            return events

        first = int(segments[0]["start"])
        last_end = int(segments[-1]["end"])

        if not self._speaking:  # 온셋 → 즉시 SPEECH_STARTED
            self._speaking = True
            self._utterance_id = str(uuid.uuid4())
            self._observed_start_ms = self._elapsed_ms(self._offset + first)
            events.append(self._speech_started(self._now_pos_ms()))

        trailing_silence = len(self._buffer) - last_end
        force = len(self._buffer) >= self._max_buffer_samples
        if trailing_silence < self._end_silence_samples and not force:
            return events  # 아직 말하는 중

        # 발화 종료
        observed_end_ms = self._elapsed_ms(self._offset + last_end)
        reason: TerminationReason = "MAX_DURATION" if force else "SILENCE"
        events.append(self._speech_ended(self._now_pos_ms(), observed_end_ms, reason))
        utterance = self._buffer[first:last_end].copy()
        self._emit_transcript(events, utterance, observed_end_ms)

        self._buffer = self._buffer[last_end:]
        self._offset += last_end
        self._speaking = False
        self._utterance_id = ""
        return events

    def flush(self) -> List[StreamEvent]:
        """정상 종료 시 진행 중 발화를 강제 종료·전사(terminationReason=SESSION_ENDED)."""
        events: List[StreamEvent] = []
        if self._withdrawn or not self._speaking:
            self._speaking = False
            self._utterance_id = ""
            return events
        segments = get_speech_timestamps(self._buffer, self.vad_opts)
        if segments:
            last_end = int(segments[-1]["end"])
            observed_end_ms = self._elapsed_ms(self._offset + last_end)
            events.append(self._speech_ended(self._now_pos_ms(), observed_end_ms, "SESSION_ENDED"))
            utterance = self._buffer[int(segments[0]["start"]) : last_end].copy()
            self._emit_transcript(events, utterance, observed_end_ms)
        self._buffer = np.empty(0, dtype=np.float32)
        self._speaking = False
        self._utterance_id = ""
        return events

    def withdraw(self) -> None:
        """동의 철회 — 입력·VAD 상태 폐기, 이후 feed 무시."""
        self._withdrawn = True
        self._buffer = np.empty(0, dtype=np.float32)
        self._speaking = False
        self._utterance_id = ""


class SessionSttRunner:
    """공유 엔진 + 비동기 전사 worker 위에서 화자별 스트림을 userId로 라우팅.

    feed()는 SPEECH_* 만 즉시 반환, TRANSCRIPT_FINALIZED는 poll_transcripts()로 드레인.
    """

    def __init__(
        self,
        engine: SttEngine,
        *,
        session_id: str,
        vad_opts: VadOptions,
        end_silence_ms: int = 700,
        min_confidence: float = 0.5,
        max_pending: int = 8,
        session_epoch_ms: int = 0,
    ) -> None:
        self.engine = engine
        self.session_id = session_id
        self._vad_opts = vad_opts
        self._end_silence_ms = end_silence_ms
        self._min_confidence = min_confidence
        self._anchor = time.monotonic()
        self._session_epoch_ms = session_epoch_ms
        self._worker = TranscriptionWorker(engine, max_pending=max_pending, now_ms=self._now_ms)
        self._streams: Dict[str, SpeakerStream] = {}

    def _now_ms(self) -> int:
        return self._session_epoch_ms + int((time.monotonic() - self._anchor) * 1000)

    def stream(
        self,
        user_id: str,
        participant_identity: str,
        stream_epoch_ms: int = 0,
        client_instance_id: str | None = None,
    ) -> SpeakerStream:
        if user_id not in self._streams:
            self._streams[user_id] = SpeakerStream(
                self.engine,
                session_id=self.session_id,
                user_id=user_id,
                participant_identity=participant_identity,
                vad_opts=self._vad_opts,
                stream_epoch_ms=stream_epoch_ms,
                client_instance_id=client_instance_id,
                end_silence_ms=self._end_silence_ms,
                min_confidence=self._min_confidence,
                submit_transcription=self._worker.submit,
                next_seq=self._worker.next_seq,
            )
        return self._streams[user_id]

    def feed(
        self,
        *,
        user_id: str,
        participant_identity: str,
        audio: np.ndarray,
        stream_epoch_ms: int = 0,
    ) -> List[StreamEvent]:
        return self.stream(user_id, participant_identity, stream_epoch_ms).feed(audio)

    def poll_transcripts(self) -> List[TranscriptFinalizedEvent]:
        return self._worker.poll()

    @property
    def dropped_count(self) -> int:
        return self._worker.dropped_count

    def withdraw(self, user_id: str) -> None:
        if user_id in self._streams:
            self._streams[user_id].withdraw()
        self._worker.withdraw(user_id)

    def wait_idle(self, timeout: float = 3.0) -> bool:
        return self._worker.wait_idle(timeout)

    def close(self, *, timeout: float = 3.0) -> List[StreamEvent]:
        final: List[StreamEvent] = []
        for s in self._streams.values():
            final += s.flush()
        self._worker.close(flush=True, timeout=timeout)
        return final
