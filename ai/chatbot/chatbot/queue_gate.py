"""LLM 동시 실행 제한 + 유한 대기열 (BE 계약 2026-08-05).

GPU가 한 번에 한 요청만 감당할 수 있으면, 넘치는 요청을 그냥 밀어 넣는 대신 여기서
줄을 세운다. 줄도 무한하면 안 된다 — 기다리다 전부 타임아웃 나는 것보다 빨리 거절하는
편이 사용자에게 낫다.

  자리 있음 → 즉시 started
  자리 없음 → queued(position) → heartbeat 반복 → 자리 나면 started
  줄이 꽉 참 → QueueFull  (HTTP 503 AI_QUEUE_FULL)
  줄에서 만료 → QueueTimeout (event: error AI_QUEUE_TIMEOUT)

대기 중에도 heartbeat를 보내야 한다. 아무것도 안 보내면 중간 프록시(nginx)가 죽은
연결로 보고 끊는다.
"""

from __future__ import annotations

import threading
import time


class QueueFull(Exception):
    """대기열이 가득 찼다. 받아줄 수 없으니 즉시 거절한다."""


class QueueTimeout(Exception):
    """대기 제한 시간 안에 자리가 나지 않았다."""


class Ticket:
    """대기열에 잡아 둔 자리 하나. 반드시 `release()`로 반납한다."""

    def __init__(self, gate: LlmGate, position: int) -> None:
        self._gate = gate
        self.position = position
        """앞에 몇 명이 있는지. 0이면 기다리지 않고 바로 시작한다."""
        # 상태는 셋 중 하나다: 실행 자리 보유 / 줄에 서 있음 / 아무것도 없음(반납 완료).
        self._holds_slot = position == 0
        self._holds_queue_spot = position > 0
        self._deadline = time.monotonic() + gate.wait_timeout_seconds

    @property
    def acquired(self) -> bool:
        return self._holds_slot

    def wait(self, poll_seconds: float) -> bool:
        """poll_seconds 동안 자리를 기다린다. 잡으면 True.

        호출자는 False를 받을 때마다 heartbeat를 보내고 다시 부른다.
        제한 시간을 넘기면 QueueTimeout(이때 줄에서는 빠진다).
        """
        if self._holds_slot:
            return True
        remaining = self._deadline - time.monotonic()
        if remaining <= 0:
            self._drop_queue_spot()
            raise QueueTimeout
        if self._gate._semaphore.acquire(timeout=min(poll_seconds, remaining)):
            self._holds_slot = True
            self._drop_queue_spot()
            return True
        if time.monotonic() >= self._deadline:
            self._drop_queue_spot()
            raise QueueTimeout
        return False

    def _drop_queue_spot(self) -> None:
        if self._holds_queue_spot:
            self._holds_queue_spot = False
            self._gate._leave_queue()

    def release(self) -> None:
        """자리를 반납한다. 여러 번 불러도 안전하다."""
        self._drop_queue_spot()
        if self._holds_slot:
            self._holds_slot = False
            self._gate._semaphore.release()

    def __enter__(self) -> Ticket:
        return self

    def __exit__(self, *exc: object) -> None:
        self.release()


class LlmGate:
    """동시 실행 N개까지 허용하고, 초과분을 최대 M개까지 줄 세운다."""

    def __init__(
        self,
        *,
        max_concurrent: int = 1,
        max_waiting: int = 10,
        wait_timeout_seconds: float = 120.0,
    ) -> None:
        if max_concurrent < 1:
            raise ValueError("max_concurrent는 1 이상이어야 합니다")
        self.max_concurrent = max_concurrent
        self.max_waiting = max_waiting
        self.wait_timeout_seconds = wait_timeout_seconds
        self._semaphore = threading.Semaphore(max_concurrent)
        self._lock = threading.Lock()
        self._waiting = 0

    @property
    def waiting(self) -> int:
        with self._lock:
            return self._waiting

    def enter(self) -> Ticket:
        """자리를 잡거나 줄에 선다. 줄이 꽉 찼으면 QueueFull.

        블록하지 않는다 — 기다리는 건 `Ticket.wait()`이 한다. 그래야 호출자가
        기다리기 **전에** queued 이벤트를 내보낼 수 있다.
        """
        if self._semaphore.acquire(blocking=False):
            return Ticket(self, position=0)
        with self._lock:
            if self._waiting >= self.max_waiting:
                raise QueueFull
            self._waiting += 1
            position = self._waiting
        return Ticket(self, position=position)

    def _leave_queue(self) -> None:
        with self._lock:
            if self._waiting > 0:
                self._waiting -= 1


def gate_from_env() -> LlmGate:
    """환경변수로 정책을 읽는다. GPU 사정에 따라 배포마다 다르다."""
    import os

    return LlmGate(
        max_concurrent=int(os.environ.get("AI_CHAT_MAX_CONCURRENT", "1")),
        max_waiting=int(os.environ.get("AI_CHAT_MAX_WAITING", "10")),
        wait_timeout_seconds=float(os.environ.get("AI_CHAT_QUEUE_TIMEOUT_SECONDS", "120")),
    )
