#!/usr/bin/env python3
"""Compare direct WAITING polling with the current DB Job Queue dispatch model.

This benchmark intentionally measures orchestration overhead and progress, not the
candidate-scoring algorithm. Both modes execute the same configurable simulated
work after dispatch so that only the dispatch model differs.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

import pymysql
from pymysql.err import OperationalError


FIRST_REQUEST_ID = 10_001
LAST_FIXTURE_REQUEST_ID = 20_000


@dataclass(frozen=True)
class BenchmarkResult:
    repetition: int
    mode: str
    scenario: str
    request_count: int
    batch_size: int
    workers: int
    simulated_work_ms: float
    elapsed_ms: float
    attempts: int
    unique_processed: int
    duplicate_attempts: int
    lock_conflicts: int
    progress_ratio: float
    throughput_per_second: float
    batch_latency_p50_ms: float
    batch_latency_p95_ms: float
    batch_latency_max_ms: float


class Counters:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.attempts = 0
        self.unique_processed = 0
        self.lock_conflicts = 0
        self.latencies_ms: list[float] = []

    def add(self, attempts: int, unique_processed: int, latency_ms: float) -> None:
        with self.lock:
            self.attempts += attempts
            self.unique_processed += unique_processed
            self.latencies_ms.append(latency_ms)

    def add_lock_conflict(self) -> None:
        with self.lock:
            self.lock_conflicts += 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="date")
    parser.add_argument("--password", default="date")
    parser.add_argument("--database", default="date")
    parser.add_argument("--requests", type=int, default=1_000)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--work-ms", type=float, default=2.0)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument(
        "--scenario",
        choices=("progress", "throughput", "all"),
        default="all",
    )
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def connection(args: argparse.Namespace):
    return pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        database=args.database,
        autocommit=False,
        charset="utf8mb4",
    )


def request_range(args: argparse.Namespace) -> tuple[int, int]:
    if args.requests <= 0 or args.requests > 10_000:
        raise ValueError("--requests must be between 1 and 10000")
    if args.batch_size <= 0 or args.batch_size > args.requests:
        raise ValueError("--batch-size must be between 1 and request count")
    if args.workers <= 0 or args.workers > 16:
        raise ValueError("--workers must be between 1 and 16")
    if args.repeat <= 0 or args.repeat > 100:
        raise ValueError("--repeat must be between 1 and 100")
    if args.work_ms < 0:
        raise ValueError("--work-ms cannot be negative")
    return FIRST_REQUEST_ID, FIRST_REQUEST_ID + args.requests - 1


def verify_fixture(args: argparse.Namespace, first_id: int, last_id: int) -> None:
    if last_id > LAST_FIXTURE_REQUEST_ID:
        raise RuntimeError("benchmark request range exceeds the synthetic fixture")
    with connection(args) as conn, conn.cursor() as cursor:
        cursor.execute("SELECT DATABASE()")
        selected_database = cursor.fetchone()[0]
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM match_requests request
            JOIN users user ON user.userId = request.userId
            WHERE request.matchRequestId BETWEEN %s AND %s
              AND user.email LIKE 'perf-user-%%@example.com'
            """,
            (first_id, last_id),
        )
        fixture_count = cursor.fetchone()[0]
    if selected_database != args.database or fixture_count != args.requests:
        raise RuntimeError(
            "refusing to run: expected isolated synthetic benchmark fixture"
        )


def reset_requests(args: argparse.Namespace, first_id: int, last_id: int) -> None:
    with connection(args) as conn, conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE match_requests
            SET status = 'WAITING',
                cancelledAt = NULL,
                cancellationReason = NULL,
                matchedAt = NULL,
                completedAt = NULL,
                updatedAt = NOW()
            WHERE matchRequestId BETWEEN %s AND %s
            """,
            (first_id, last_id),
        )
        cursor.execute(
            "DELETE FROM match_jobs WHERE matchRequestId BETWEEN %s AND %s",
            (first_id, last_id),
        )
        conn.commit()


def seed_jobs(args: argparse.Namespace, first_id: int, last_id: int) -> None:
    with connection(args) as conn, conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO match_jobs (
                matchRequestId, status, attemptCount, availableAt,
                createdAt, updatedAt
            )
            SELECT matchRequestId, 'PENDING', 0, NOW(), NOW(), NOW()
            FROM match_requests
            WHERE matchRequestId BETWEEN %s AND %s
            ORDER BY matchRequestId
            """,
            (first_id, last_id),
        )
        conn.commit()


def sleep_work(work_ms: float) -> None:
    if work_ms > 0:
        time.sleep(work_ms / 1_000)


def percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[math.ceil(len(ordered) * ratio) - 1]


def result(
    mode: str,
    scenario: str,
    args: argparse.Namespace,
    elapsed_ms: float,
    counters: Counters,
    repetition: int,
) -> BenchmarkResult:
    unique = counters.unique_processed
    return BenchmarkResult(
        repetition=repetition,
        mode=mode,
        scenario=scenario,
        request_count=args.requests,
        batch_size=args.batch_size,
        workers=args.workers,
        simulated_work_ms=args.work_ms,
        elapsed_ms=round(elapsed_ms, 3),
        attempts=counters.attempts,
        unique_processed=unique,
        duplicate_attempts=max(counters.attempts - unique, 0),
        lock_conflicts=counters.lock_conflicts,
        progress_ratio=round(unique / args.requests, 6),
        throughput_per_second=round(
            unique / (elapsed_ms / 1_000) if elapsed_ms > 0 else 0,
            3,
        ),
        batch_latency_p50_ms=round(
            statistics.median(counters.latencies_ms)
            if counters.latencies_ms
            else 0,
            3,
        ),
        batch_latency_p95_ms=round(
            percentile(counters.latencies_ms, 0.95),
            3,
        ),
        batch_latency_max_ms=round(max(counters.latencies_ms, default=0), 3),
    )


def direct_progress(
    args: argparse.Namespace, first_id: int, last_id: int, repetition: int
) -> BenchmarkResult:
    """Reproduce repeated WAITING scans when no candidate can be created."""
    reset_requests(args, first_id, last_id)
    counters = Counters()
    cycles = math.ceil(args.requests / args.batch_size)
    seen: set[int] = set()
    started = time.perf_counter_ns()
    with connection(args) as conn, conn.cursor() as cursor:
        for _ in range(cycles):
            batch_started = time.perf_counter_ns()
            cursor.execute(
                """
                SELECT matchRequestId
                FROM match_requests
                WHERE status = 'WAITING'
                  AND matchRequestId BETWEEN %s AND %s
                ORDER BY requestedAt, matchRequestId
                LIMIT %s
                """,
                (first_id, last_id, args.batch_size),
            )
            ids = [row[0] for row in cursor.fetchall()]
            sleep_work(args.work_ms)
            before = len(seen)
            seen.update(ids)
            counters.add(
                len(ids),
                len(seen) - before,
                (time.perf_counter_ns() - batch_started) / 1_000_000,
            )
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    return result(
        "direct-scheduler",
        "no-candidate-progress",
        args,
        elapsed_ms,
        counters,
        repetition,
    )


def queue_worker(
    args: argparse.Namespace,
    first_id: int,
    last_id: int,
    counters: Counters,
    worker_number: int,
) -> None:
    worker_id = f"benchmark-worker-{worker_number}"
    with connection(args) as conn, conn.cursor() as cursor:
        while True:
            batch_started = time.perf_counter_ns()
            try:
                cursor.execute("START TRANSACTION")
                cursor.execute(
                    """
                    SELECT matchJobId
                    FROM match_jobs
                    WHERE status = 'PENDING'
                      AND availableAt <= NOW()
                      AND matchRequestId BETWEEN %s AND %s
                    ORDER BY availableAt, matchJobId
                    LIMIT %s
                    FOR UPDATE
                    """,
                    (first_id, last_id, args.batch_size),
                )
                job_ids = [row[0] for row in cursor.fetchall()]
                if not job_ids:
                    conn.rollback()
                    return
                placeholders = ",".join(["%s"] * len(job_ids))
                cursor.execute(
                    f"""
                    UPDATE match_jobs
                    SET status = 'PROCESSING',
                        attemptCount = attemptCount + 1,
                        claimedAt = NOW(),
                        workerId = %s,
                        updatedAt = NOW()
                    WHERE matchJobId IN ({placeholders})
                      AND status = 'PENDING'
                    """,
                    (worker_id, *job_ids),
                )
                claimed = cursor.rowcount
                conn.commit()
            except OperationalError as exception:
                conn.rollback()
                if exception.args[0] not in (1205, 1213):
                    raise
                counters.add_lock_conflict()
                time.sleep(0.001)
                continue

            sleep_work(args.work_ms)

            placeholders = ",".join(["%s"] * len(job_ids))
            while True:
                try:
                    cursor.execute(
                        f"""
                        UPDATE match_jobs
                        SET status = 'COMPLETED',
                            completedAt = NOW(),
                            lastError = NULL,
                            updatedAt = NOW()
                        WHERE matchJobId IN ({placeholders})
                          AND status = 'PROCESSING'
                          AND workerId = %s
                        """,
                        (*job_ids, worker_id),
                    )
                    completed = cursor.rowcount
                    conn.commit()
                    break
                except OperationalError as exception:
                    conn.rollback()
                    if exception.args[0] not in (1205, 1213):
                        raise
                    counters.add_lock_conflict()
                    time.sleep(0.001)
            counters.add(
                claimed,
                completed,
                (time.perf_counter_ns() - batch_started) / 1_000_000,
            )


def queue_run(
    args: argparse,
    first_id: int,
    last_id: int,
    scenario: str,
    repetition: int,
) -> BenchmarkResult:
    reset_requests(args, first_id, last_id)
    seed_jobs(args, first_id, last_id)
    counters = Counters()
    started = time.perf_counter_ns()
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(
                queue_worker,
                args,
                first_id,
                last_id,
                counters,
                number,
            )
            for number in range(args.workers)
        ]
        for future in futures:
            future.result()
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    return result(
        "db-job-queue",
        scenario,
        args,
        elapsed_ms,
        counters,
        repetition,
    )


def direct_worker(
    args: argparse,
    first_id: int,
    last_id: int,
    counters: Counters,
) -> None:
    with connection(args) as conn, conn.cursor() as cursor:
        while True:
            batch_started = time.perf_counter_ns()
            cursor.execute(
                """
                SELECT matchRequestId
                FROM match_requests
                WHERE status = 'WAITING'
                  AND matchRequestId BETWEEN %s AND %s
                ORDER BY requestedAt, matchRequestId
                LIMIT %s
                """,
                (first_id, last_id, args.batch_size),
            )
            request_ids = [row[0] for row in cursor.fetchall()]
            if not request_ids:
                return

            sleep_work(args.work_ms)

            placeholders = ",".join(["%s"] * len(request_ids))
            try:
                cursor.execute(
                    f"""
                    UPDATE match_requests
                    SET status = 'CANCELLED',
                        cancelledAt = NOW(),
                        cancellationReason = 'benchmark completion',
                        updatedAt = NOW()
                    WHERE matchRequestId IN ({placeholders})
                      AND status = 'WAITING'
                    """,
                    request_ids,
                )
                unique = cursor.rowcount
                conn.commit()
            except OperationalError as exception:
                conn.rollback()
                if exception.args[0] not in (1205, 1213):
                    raise
                counters.add_lock_conflict()
                counters.add(
                    len(request_ids),
                    0,
                    (time.perf_counter_ns() - batch_started) / 1_000_000,
                )
                time.sleep(0.001)
                continue
            counters.add(
                len(request_ids),
                unique,
                (time.perf_counter_ns() - batch_started) / 1_000_000,
            )


def direct_throughput(
    args: argparse.Namespace, first_id: int, last_id: int, repetition: int
) -> BenchmarkResult:
    reset_requests(args, first_id, last_id)
    counters = Counters()
    started = time.perf_counter_ns()
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(direct_worker, args, first_id, last_id, counters)
            for _ in range(args.workers)
        ]
        for future in futures:
            future.result()
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    return result(
        "direct-scheduler",
        "successful-throughput",
        args,
        elapsed_ms,
        counters,
        repetition,
    )


def print_result(value: BenchmarkResult) -> None:
    print(json.dumps(asdict(value), ensure_ascii=False, sort_keys=True))


def main() -> None:
    args = parse_args()
    first_id, last_id = request_range(args)
    verify_fixture(args, first_id, last_id)
    results: list[BenchmarkResult] = []

    for repetition in range(1, args.repeat + 1):
        if args.scenario in ("progress", "all"):
            results.append(
                direct_progress(args, first_id, last_id, repetition)
            )
            results.append(
                queue_run(
                    args,
                    first_id,
                    last_id,
                    "no-candidate-progress",
                    repetition,
                )
            )
        if args.scenario in ("throughput", "all"):
            results.append(
                direct_throughput(args, first_id, last_id, repetition)
            )
            results.append(
                queue_run(
                    args,
                    first_id,
                    last_id,
                    "successful-throughput",
                    repetition,
                )
            )

    reset_requests(args, first_id, last_id)
    for value in results:
        print_result(value)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(
                {
                    "measuredAt": datetime.now().astimezone().isoformat(),
                    "results": [asdict(value) for value in results],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
