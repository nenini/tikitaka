"""비동기 전사 worker 테스트 — bounded queue·gapless seq·동의철회."""

import threading
import time
import uuid

import numpy as np

from stt.pipeline import TranscriptPiece
from stt.transcription import TranscriptionJob, TranscriptionWorker


class FakeEngine:
    def transcribe_chunk(
        self, audio: np.ndarray, *, base_ms: int = 0, vad_filter: bool = False, min_confidence: float = 0.5
    ) -> list[TranscriptPiece]:
        return [TranscriptPiece("발화", 0.9, base_ms, base_ms + 100, "ko")]


class FirstEmptyEngine:
    """첫 호출은 환각(빈 결과), 이후는 정상 — gapless seq 검증용."""

    def __init__(self) -> None:
        self.n = 0

    def transcribe_chunk(
        self, audio: np.ndarray, *, base_ms: int = 0, vad_filter: bool = False, min_confidence: float = 0.5
    ) -> list[TranscriptPiece]:
        self.n += 1
        if self.n == 1:
            return []
        return [TranscriptPiece("발화", 0.9, base_ms, base_ms + 100, "ko")]


class BlockingEngine:
    """gate가 열릴 때까지 전사를 막는다 — 큐 적체·철회 타이밍 검증용."""

    def __init__(self) -> None:
        self.gate = threading.Event()

    def transcribe_chunk(
        self, audio: np.ndarray, *, base_ms: int = 0, vad_filter: bool = False, min_confidence: float = 0.5
    ) -> list[TranscriptPiece]:
        self.gate.wait(timeout=5)
        return [TranscriptPiece("발화", 0.9, base_ms, base_ms + 100, "ko")]


def _job(user_id: str = "42", cid: str | None = None) -> TranscriptionJob:
    return TranscriptionJob(
        audio=np.zeros(100, dtype=np.float32),
        session_id="s1",
        user_id=user_id,
        participant_identity=f"lk-{user_id}",
        client_instance_id=cid or str(uuid.uuid4()),
        utterance_id=str(uuid.uuid4()),
        observed_start_ms=1200,
        observed_end_ms=5200,
        min_confidence=0.5,
    )


def _wait_busy(w: TranscriptionWorker, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and not w._busy:  # noqa: SLF001 (테스트)
        time.sleep(0.005)


def test_worker_emits_transcript() -> None:
    w = TranscriptionWorker(FakeEngine())
    w.submit(_job())
    assert w.wait_idle()
    out = w.poll()
    w.close()
    assert len(out) == 1
    assert out[0].event_type == "TRANSCRIPT_FINALIZED"
    assert out[0].seq == 1


def test_wait_idle_then_single_poll_gets_all() -> None:
    # pending 카운터: wait_idle 후 단일 poll이 제출한 모든 transcript를 회수(전사 중 유실 없음)
    w = TranscriptionWorker(FakeEngine())
    sid = str(uuid.uuid4())
    for _ in range(5):
        w.submit(_job(cid=sid))
    assert w.wait_idle()
    out = w.poll()
    w.close()
    assert [e.seq for e in out] == [1, 2, 3, 4, 5]  # 5개 전부·gapless·순서


def test_seq_gapless_skips_empty() -> None:
    w = TranscriptionWorker(FirstEmptyEngine())
    sid = str(uuid.uuid4())
    w.submit(_job(cid=sid))  # 빈 결과 → 미발행, seq 소비 안 함
    w.submit(_job(cid=sid))  # 정상 → seq 1
    assert w.wait_idle()
    out = w.poll()
    w.close()
    assert len(out) == 1
    assert out[0].seq == 1  # 2가 아니라 1 (구멍 없음)


def test_drop_oldest_on_overflow() -> None:
    engine = BlockingEngine()
    w = TranscriptionWorker(engine, max_pending=2)
    w.submit(_job())          # 워커가 즉시 집어 blocking
    _wait_busy(w)
    w.submit(_job())          # 큐 1
    w.submit(_job())          # 큐 2 (가득)
    w.submit(_job())          # 초과 → 가장 오래된 것 폐기
    assert w.dropped_count == 1
    engine.gate.set()
    assert w.wait_idle()
    out = w.poll()
    w.close()
    assert len(out) == 3      # 4개 중 1개 폐기


def test_withdraw_drops_output() -> None:
    w = TranscriptionWorker(FakeEngine())
    w.submit(_job(user_id="42"))
    assert w.wait_idle()
    w.withdraw("42")          # 이미 나온 결과도 폐기
    out = w.poll()
    w.close()
    assert out == []


def test_withdraw_blocks_inflight() -> None:
    engine = BlockingEngine()
    w = TranscriptionWorker(engine)
    w.submit(_job(user_id="42"))  # 처리 중 blocking
    _wait_busy(w)
    w.withdraw("42")              # 전사 중 철회 → 완료돼도 폐기
    w.submit(_job(user_id="99"))  # 다른 사용자 → 정상
    engine.gate.set()
    assert w.wait_idle()
    out = w.poll()
    w.close()
    assert [e.user_id for e in out] == ["99"]
