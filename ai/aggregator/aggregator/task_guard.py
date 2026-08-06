"""던지고 잊는 asyncio 태스크가 조용히 죽지 않게 하는 콜백.

`asyncio.create_task`로 띄운 태스크는 예외가 나면 그 태스크만 끝나고 **예외는 Task
안에 보관만 된다.** 아무도 물어보지 않으면 로그도 안 남는다. 게다가 종료 시
`gather(..., return_exceptions=True)`로 회수해 버리면 파이썬이 주는 마지막 경고
("Task exception was never retrieved")까지 사라진다.

2026-08-06 운영 장애가 정확히 그랬다 — 전사 poll 루프가 죽었는데 로그가 한 줄도
없어서 원인을 찾는 데 이틀이 걸렸다. 세션 내내 도는 루프는 **본문에 try/except**를
두고, 단발 태스크는 이 콜백을 붙인다.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


def log_task_failure(task: asyncio.Task[object]) -> None:
    if task.cancelled():
        return
    error = task.exception()
    if error is not None:
        logger.error(
            "background task failed name=%s",
            task.get_name(),
            exc_info=(type(error), error, error.__traceback__),
        )


__all__ = ["log_task_failure"]
