"""LLM 대기열 검증 (BE 계약 2026-08-05).

관심사는 "GPU가 하나뿐일 때 넘치는 요청을 어떻게 다루는가"다.
줄 세우기·거절·만료·자리 반납이 전부 정확해야 한다 — 자리를 한 번 놓치면
대기열이 영구히 막힌다.
"""

from __future__ import annotations

import threading
import time

import pytest

from chatbot.queue_gate import LlmGate, QueueFull, QueueTimeout


def _gate(**over: object) -> LlmGate:
    kw: dict[str, object] = dict(max_concurrent=1, max_waiting=2, wait_timeout_seconds=1.0)
    kw.update(over)
    return LlmGate(**kw)  # type: ignore[arg-type]


def test_first_request_starts_without_queueing() -> None:
    ticket = _gate().enter()
    assert ticket.acquired
    assert ticket.position == 0


def test_second_request_is_queued_with_position() -> None:
    gate = _gate()
    first = gate.enter()
    second = gate.enter()
    assert first.acquired
    assert not second.acquired
    assert second.position == 1


def test_queue_full_is_rejected_not_queued() -> None:
    """무한 대기열은 만들지 않는다 — 다 기다리다 전부 타임아웃 나느니 빨리 거절한다."""
    gate = _gate(max_waiting=2)
    gate.enter()          # 실행 자리
    gate.enter()          # 대기 1
    gate.enter()          # 대기 2
    with pytest.raises(QueueFull):
        gate.enter()      # 초과 → 503 AI_QUEUE_FULL


def test_waiting_request_starts_when_slot_frees() -> None:
    gate = _gate(wait_timeout_seconds=5.0)
    first = gate.enter()
    second = gate.enter()
    assert not second.wait(0.05)      # 아직 자리 없음 → heartbeat 구간
    first.release()
    assert second.wait(1.0)
    assert second.acquired


def test_wait_expires_into_timeout() -> None:
    gate = _gate(wait_timeout_seconds=0.2)
    gate.enter()
    waiter = gate.enter()
    with pytest.raises(QueueTimeout):
        for _ in range(20):
            waiter.wait(0.05)


def test_timed_out_waiter_frees_its_queue_spot() -> None:
    """만료된 요청이 줄을 계속 차지하면 대기열이 서서히 막힌다."""
    gate = _gate(max_waiting=1, wait_timeout_seconds=0.1)
    gate.enter()
    waiter = gate.enter()
    assert gate.waiting == 1
    with pytest.raises(QueueTimeout):
        for _ in range(10):
            waiter.wait(0.05)
    assert gate.waiting == 0
    gate.enter()  # 자리가 비었으니 다시 줄설 수 있어야 한다


def test_release_is_idempotent() -> None:
    """스트림이 예외로 끊기면 finally가 두 번 탈 수 있다."""
    gate = _gate()
    ticket = gate.enter()
    ticket.release()
    ticket.release()
    assert gate.enter().acquired  # 자리가 하나만 반납됐어야 한다


def test_abandoned_waiter_frees_spot_on_release() -> None:
    gate = _gate(max_waiting=1)
    gate.enter()
    waiter = gate.enter()
    assert gate.waiting == 1
    waiter.release()          # 기다리다 클라이언트가 끊은 경우
    assert gate.waiting == 0


def test_concurrent_enter_never_exceeds_limits() -> None:
    """여러 스레드가 동시에 들어와도 실행 자리는 max_concurrent를 넘지 않는다."""
    gate = LlmGate(max_concurrent=2, max_waiting=50, wait_timeout_seconds=5.0)
    running = 0
    peak = 0
    lock = threading.Lock()

    def worker() -> None:
        nonlocal running, peak
        ticket = gate.enter()
        while not ticket.wait(0.05):
            pass
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.02)
        with lock:
            running -= 1
        ticket.release()

    threads = [threading.Thread(target=worker) for _ in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert peak <= 2
    assert gate.waiting == 0
