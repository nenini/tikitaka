"""오디오 프레임 배치 처리 (2026-08-06 운영 장애 대응).

`feed()`는 Whisper가 아니라 **VAD**를 돌린다(Whisper는 worker 스레드). 그런데 버퍼
전체를 매 프레임 다시 훑어서 발화가 길어질수록 비싸진다 — 실측 8초 버퍼 14.6ms로
20ms 프레임 예산의 73%다. 화자 2명이면 예산을 넘겨 이벤트 루프가 밀리고, 코칭 LLM
응답이 도착해도 집어들 틈이 없어 3초 타임아웃에 걸렸다(9/9 폴백).

여기서는 배치 크기 계산과 꼬리 처리만 검증한다. LiveKit 스트림 자체는 붙이지 않는다.
"""

from __future__ import annotations

import numpy as np

from aggregator.livekit_stt import FEED_BATCH_MS
from stt.pipeline import SAMPLE_RATE


def _frames(count: int, ms: int = 20) -> list[np.ndarray]:
    return [np.zeros(SAMPLE_RATE * ms // 1000, dtype=np.float32) for _ in range(count)]


def _batch(frames: list[np.ndarray]) -> tuple[list[np.ndarray], np.ndarray | None]:
    """_consume_audio 의 배치 로직과 같은 규칙. (내보낸 청크들, 남은 꼬리)."""
    batch_samples = SAMPLE_RATE * FEED_BATCH_MS // 1000
    sent: list[np.ndarray] = []
    pending: list[np.ndarray] = []
    total = 0
    for frame in frames:
        pending.append(frame)
        total += len(frame)
        if total < batch_samples:
            continue
        sent.append(np.concatenate(pending))
        pending.clear()
        total = 0
    tail = np.concatenate(pending) if pending else None
    return sent, tail


def test_batch_window_is_100ms() -> None:
    """20ms 프레임 5개가 모여야 한 번 나간다 — VAD 호출이 1/5로 준다."""
    assert FEED_BATCH_MS == 100
    sent, tail = _batch(_frames(5))
    assert len(sent) == 1
    assert len(sent[0]) == SAMPLE_RATE * 100 // 1000
    assert tail is None


def test_frames_below_the_window_are_not_sent_yet() -> None:
    sent, tail = _batch(_frames(4))
    assert sent == []
    assert tail is not None and len(tail) == SAMPLE_RATE * 80 // 1000


def test_leftover_tail_is_kept_not_dropped() -> None:
    """꼬리를 버리면 마지막 발화의 끝(종결 어미)이 잘린다."""
    sent, tail = _batch(_frames(7))
    assert len(sent) == 1
    assert tail is not None
    assert len(sent[0]) + len(tail) == 7 * SAMPLE_RATE * 20 // 1000


def test_no_audio_is_lost_across_batches() -> None:
    frames = _frames(23)
    sent, tail = _batch(frames)
    total_out = sum(len(c) for c in sent) + (len(tail) if tail is not None else 0)
    assert total_out == sum(len(f) for f in frames)


def test_batch_does_not_reorder_audio() -> None:
    """순서가 바뀌면 전사가 뒤섞인다."""
    frames = [np.full(SAMPLE_RATE * 20 // 1000, i, dtype=np.float32) for i in range(10)]
    sent, tail = _batch(frames)
    restored = np.concatenate(sent + ([tail] if tail is not None else []))
    expected = np.concatenate(frames)
    assert np.array_equal(restored, expected)
