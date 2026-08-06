"""비동기 전사 worker — VAD 경로를 Whisper 지연에서 분리한다.

feed()가 발화 종료를 감지하면 전사 job을 bounded queue에 넣고 즉시 리턴한다(SPEECH_*는
큐를 거치지 않음). 단일 워커 스레드가 공유 엔진으로 직렬 전사하여 TRANSCRIPT_FINALIZED를
출력 큐에 넣고, 호출자는 poll()로 드레인한다.

seq는 이벤트 종류 무관 (sessionId, userId, clientInstanceId) 범위에서 단조 증가해야 하므로,
카운터를 worker가 소유하고 SPEECH는 next_seq()로, TRANSCRIPT는 worker가 발행 시점에 매긴다.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from stt.events import TranscriptFinalizedEvent, TranscriptPayload
from stt.pipeline import SAMPLE_RATE, TranscriptPiece

logger = logging.getLogger(__name__)


class Transcriber(Protocol):
    def transcribe_chunk(
        self,
        audio: np.ndarray,
        *,
        base_ms: int = 0,
        vad_filter: bool = False,
        min_confidence: float = 0.5,
    ) -> list[TranscriptPiece]: ...


@dataclass(frozen=True)
class TranscriptionJob:
    """발화 하나의 전사 요청 — 이벤트 조립 문맥을 캡처(리셋과 무관하게 안전).

    seq·session_elapsed_ms(전사 완료 시각)는 worker가 발행 시점에 채운다.
    segment 시각은 VAD가 관찰한 발화 구간(observed_start/end)을 그대로 쓴다.
    """

    audio: np.ndarray
    session_id: str
    user_id: str
    participant_identity: str
    client_instance_id: str
    utterance_id: str
    observed_start_ms: int
    observed_end_ms: int
    min_confidence: float


def _monotonic_clock(epoch_ms: int) -> Callable[[], int]:
    anchor = time.monotonic()
    return lambda: epoch_ms + int((time.monotonic() - anchor) * 1000)


class TranscriptionWorker:
    """공유 엔진 위 단일 워커 스레드 + bounded queue."""

    def __init__(
        self,
        engine: Transcriber,
        *,
        max_pending: int = 8,
        now_ms: Callable[[], int] | None = None,
    ) -> None:
        self._engine = engine
        self._now_ms = now_ms if now_ms is not None else _monotonic_clock(0)
        self._jobs: queue.Queue[TranscriptionJob | None] = queue.Queue(maxsize=max_pending)
        self._out: queue.Queue[TranscriptFinalizedEvent] = queue.Queue()
        self._lock = threading.Lock()  # 큐·withdrawn·seq·out 보호
        self._withdrawn: set[str] = set()
        self._seq_by_stream: dict[str, int] = {}  # (clientInstanceId)별 통합 seq — SPEECH도 공유
        self._pending = 0  # 제출~완료(발행/폐기) 사이 job 수 — idle 판정용
        self._busy = False
        self.dropped_count = 0
        self.empty_transcript_count = 0
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def next_seq(self, client_instance_id: str) -> int:
        """SPEECH 이벤트용 통합 seq 발급(TRANSCRIPT와 같은 카운터)."""
        with self._lock:
            n = self._seq_by_stream.get(client_instance_id, 0) + 1
            self._seq_by_stream[client_instance_id] = n
            return n

    def submit(self, job: TranscriptionJob) -> None:
        """전사 job 제출. 큐가 차면 가장 오래된 것을 버린다(drop-oldest)."""
        with self._lock:
            if job.user_id in self._withdrawn:
                return
            try:
                self._jobs.put_nowait(job)
                self._pending += 1
            except queue.Full:
                try:
                    self._jobs.get_nowait()
                    self._jobs.task_done()
                    self._pending -= 1
                    self.dropped_count += 1
                except queue.Empty:
                    pass
                self._jobs.put_nowait(job)
                self._pending += 1

    def _run(self) -> None:
        while True:
            job = self._jobs.get()
            if job is None:
                self._jobs.task_done()
                return
            try:
                with self._lock:
                    self._busy = True
                if job.user_id in self._withdrawn:
                    continue
                pieces = self._engine.transcribe_chunk(
                    job.audio, base_ms=job.observed_start_ms, min_confidence=job.min_confidence
                )
                if not pieces:
                    # 환각 필터로 비면 미발행(seq 미소비).
                    #
                    # **여기가 유일한 판별 지점이다.** VAD 는 발화를 열었는데 전사가
                    # 하나도 안 나온 경우인데, 원인이 둘이고 처방이 정반대다:
                    #   (i) 잡음에 VAD 가 열렸다 → VAD 를 조여야 한다
                    #   (ii) 진짜 말을 신뢰도 필터가 버렸다 → 필터를 풀어야 한다
                    # 길이가 갈라 준다. 잡음 블립은 250ms~1초, 진짜 말은 2초 이상이다.
                    # 지금까지 이 발화들은 흔적 없이 사라져서 어느 쪽인지 알 수 없었다.
                    self.empty_transcript_count += 1
                    logger.info(
                        "transcript empty after filters user=%s utterance=%s "
                        "audioMs=%d observedMs=%d-%d total=%d",
                        job.user_id,
                        job.utterance_id,
                        int(len(job.audio) / SAMPLE_RATE * 1000),
                        job.observed_start_ms,
                        job.observed_end_ms,
                        self.empty_transcript_count,
                    )
                    continue
                # 철회 재검사 + seq 발행 + 완료시각 + out.put 을 한 임계구역에서(원자적)
                with self._lock:
                    if job.user_id not in self._withdrawn:
                        seq = self._seq_by_stream.get(job.client_instance_id, 0) + 1
                        self._seq_by_stream[job.client_instance_id] = seq
                        self._out.put(_build_transcript(job, pieces, seq, self._now_ms()))
            finally:
                with self._lock:
                    self._busy = False
                    self._pending -= 1
                self._jobs.task_done()

    def poll(self) -> list[TranscriptFinalizedEvent]:
        out: list[TranscriptFinalizedEvent] = []
        while True:
            try:
                out.append(self._out.get_nowait())
            except queue.Empty:
                break
        return out

    def withdraw(self, user_id: str) -> None:
        with self._lock:
            self._withdrawn.add(user_id)
            self._drop_output(user_id)

    def _drop_output(self, user_id: str) -> None:
        kept: list[TranscriptFinalizedEvent] = []
        while True:
            try:
                item = self._out.get_nowait()
            except queue.Empty:
                break
            if item.user_id != user_id:
                kept.append(item)
        for item in kept:
            self._out.put(item)

    def wait_idle(self, timeout: float = 3.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                idle = self._pending == 0
            if idle:
                return True
            time.sleep(0.005)
        return False

    def close(self, *, flush: bool = True, timeout: float = 3.0) -> None:
        if flush:
            self.wait_idle(timeout)
        self._jobs.put(None)
        self._thread.join(timeout=timeout)


def _build_transcript(
    job: TranscriptionJob, pieces: list[TranscriptPiece], seq: int, session_elapsed_ms: int
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id=job.session_id,
        user_id=job.user_id,
        participant_identity=job.participant_identity,
        client_instance_id=job.client_instance_id,
        seq=seq,
        utterance_id=job.utterance_id,
        session_elapsed_ms=session_elapsed_ms,  # 전사 완료 시각
        confidence=min(p.confidence for p in pieces),
        payload=TranscriptPayload(
            text=" ".join(p.text for p in pieces),
            language=pieces[0].language,
            segment_start_ms=job.observed_start_ms,  # 실제 발화 구간(VAD 관찰)
            segment_end_ms=job.observed_end_ms,
        ),
    )
