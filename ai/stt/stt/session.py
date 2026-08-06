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

import math
import re
import threading
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
from stt.pipeline import SAMPLE_RATE
from stt.transcription import (
    Transcriber,
    TranscriptionJob,
    TranscriptionWorker,
)

# ── 환각 억제 (stt 샌드박스에서 이벤트 자체에 적용) ─────────────────
# 관제실로 나가는 TRANSCRIPT 이벤트를 깨끗하게 만든다.
_REPEAT_GUARD_MAX_CHARS = 6
_NORMALIZE = re.compile(r"[^\w가-힣]+")


_SILENT_DBFS = -100.0
"""사실상 무음. log(0) 을 피하려고 바닥을 둔다."""


def rms_dbfs(audio: np.ndarray | None) -> float | None:
    """발화 구간의 실효 음량(dBFS). 관제실 음량 코칭의 유일한 근거다.

    VAD 가 이미 잘라낸 음성 구간만 받으므로 앞뒤 무음이 평균을 끌어내리지 않는다.
    float32 [-1,1] 기준이라 일반 발화는 대략 -30 ~ -15 dBFS 다.
    """
    if audio is None or audio.size == 0:
        return None
    rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
    if rms <= 0.0:
        return _SILENT_DBFS
    return round(max(20.0 * math.log10(rms), _SILENT_DBFS), 2)


def _normalize_text(text: str) -> str:
    return _NORMALIZE.sub("", text)


def _collapse_repeats(text: str, max_run: int = 2) -> str:
    """발화 내부 반복 환각 접기: 같은 토큰이 연속 max_run 초과면 잘라낸다("네. 네. 네." → "네. 네.")."""
    out: list[str] = []
    run = 1
    for tok in text.split():
        if out and tok == out[-1]:
            run += 1
            if run > max_run:
                continue
        else:
            run = 1
        out.append(tok)
    return " ".join(out)

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
        engine: Transcriber,
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
        self._last_norm_text = ""  # 반복억제용: 직전 발화의 정규화 텍스트

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
        self,
        created_ms: int,
        observed_end_ms: int,
        reason: TerminationReason,
        utterance: np.ndarray | None = None,
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
                rms_dbfs=rms_dbfs(utterance),
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
        text = _collapse_repeats(" ".join(p.text for p in pieces))  # 발화 내부 반복("네. 네.") 접기
        norm = _normalize_text(text)
        # 반복억제: 직전과 동일한 ≤6자 발화 반복이면 이벤트 미발행(관제실로 안 감)
        if norm == self._last_norm_text and len(norm) <= _REPEAT_GUARD_MAX_CHARS:
            return
        self._last_norm_text = norm
        events.append(
            TranscriptFinalizedEvent(
                **self._ids(),
                seq=self._next_seq(),
                session_elapsed_ms=observed_end_ms,  # 동기: 완료 ≈ 발화 종료
                confidence=min(p.confidence for p in pieces),
                payload=TranscriptPayload(
                    text=text,
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
        utterance = self._buffer[first:last_end].copy()
        events.append(
            self._speech_ended(self._now_pos_ms(), observed_end_ms, reason, utterance)
        )
        self._emit_transcript(events, utterance, observed_end_ms)

        self._buffer = self._buffer[last_end:]
        self._offset += last_end
        self._speaking = False
        self._utterance_id = ""
        return events

    def flush(
        self, reason: TerminationReason = "SESSION_ENDED"
    ) -> List[StreamEvent]:
        """진행 중 발화를 강제 종료·전사한다.

        세션 종료면 SESSION_ENDED, 트랙이 끊기거나 음소거되면 TRACK_ENDED 다.
        """
        events: List[StreamEvent] = []
        if self._withdrawn or not self._speaking:
            self._speaking = False
            self._utterance_id = ""
            return events
        segments = get_speech_timestamps(self._buffer, self.vad_opts)
        if segments:
            last_end = int(segments[-1]["end"])
            observed_end_ms = self._elapsed_ms(self._offset + last_end)
            utterance = self._buffer[int(segments[0]["start"]) : last_end].copy()
            events.append(
                self._speech_ended(
                    self._now_pos_ms(), observed_end_ms, reason, utterance
                )
            )
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
        engine: Transcriber,
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
        # feed()가 관제실에서 asyncio.to_thread 로 불린다(VAD를 이벤트 루프 밖으로
        # 빼기 위해). 트랙이 둘이면 서로 다른 스레드에서 동시에 들어오므로 지연
        # 생성을 락으로 감싼다. 스트림 하나는 자기 트랙 태스크만 만지므로 안전하다.
        self._streams_lock = threading.Lock()

    def _now_ms(self) -> int:
        return self._session_epoch_ms + int((time.monotonic() - self._anchor) * 1000)

    def stream(
        self,
        user_id: str,
        participant_identity: str,
        stream_epoch_ms: int = 0,
        client_instance_id: str | None = None,
    ) -> SpeakerStream:
        with self._streams_lock:
            existing = self._streams.get(user_id)
            if existing is not None:
                return existing
            created = SpeakerStream(
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
            self._streams[user_id] = created
            return created

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

    def flush_speaker(self, user_id: str) -> List[StreamEvent]:
        """트랙이 끊기거나 음소거된 화자의 진행 중 발화를 마감한다.

        마감하지 않으면 SPEECH_ENDED 가 영영 안 나가고, 관제실의 `is_speaking` 이
        True 로 고착된다. 침묵 감지는 "아무도 말하고 있지 않을 때"만 도는데 그 게이트가
        `any()` 라, 한 명만 고착돼도 **세션 내내 침묵 코칭이 죽는다**.

        음소거는 트랙 구독이 끊기지 않아 `close()` 를 기다릴 수도 없다. 프레임만 멈추므로
        VAD 는 뒤따르는 침묵을 볼 기회 자체가 없다.
        """
        with self._streams_lock:
            stream = self._streams.get(user_id)
        if stream is None:
            return []
        return stream.flush("TRACK_ENDED")

    def withdraw(self, user_id: str) -> None:
        if user_id in self._streams:
            self._streams[user_id].withdraw()
        self._worker.withdraw(user_id)

    def wait_idle(self, timeout: float = 3.0) -> bool:
        return self._worker.wait_idle(timeout)

    def close(self, *, timeout: float = 3.0) -> List[StreamEvent]:
        """스트림을 비우고 남은 전사까지 모두 돌려준다.

        `flush()`가 마지막 발화를 worker에 제출하고 `worker.close(flush=True)`가 그걸
        끝까지 전사한다. 그런데 완성된 TRANSCRIPT_FINALIZED는 worker의 출력 큐에 쌓이므로
        **여기서 꺼내지 않으면 세션 마지막 발화들이 그대로 유실된다.**
        호출자가 close() 뒤에 poll_transcripts()를 또 부르게 만들면 잊어버린다.
        """
        # 순서가 중요하다. seq는 발급 순서대로 나가야 하고, 관제실은 역행을
        # SttSequenceError 로 거부한다 — 종료 처리가 거기서 끊기면 전사 보관과
        # 리포트 생성이 통째로 스킵된다(2026-08-06 운영 장애).
        #
        #   ① 이미 발급돼 큐에 남은 전사를 먼저 꺼낸다 (낮은 seq)
        #   ② flush 가 마지막 SPEECH_ENDED 에 새 seq 를 받는다
        #   ③ worker 가 남은 오디오를 전사하며 그다음 seq 를 받는다
        final: List[StreamEvent] = list(self.poll_transcripts())
        for s in self._streams.values():
            final += s.flush()
        self._worker.close(flush=True, timeout=timeout)
        final += self.poll_transcripts()
        return final
