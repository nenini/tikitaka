#!/usr/bin/env python3
"""Aggregate raw benchmark repetitions without hiding their distribution."""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from pathlib import Path


FIELDS = (
    "elapsed_ms",
    "throughput_per_second",
    "attempts",
    "unique_processed",
    "duplicate_attempts",
    "progress_ratio",
    "batch_latency_p50_ms",
    "batch_latency_p95_ms",
    "batch_latency_max_ms",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def median(rows: list[dict], field: str) -> float:
    return round(statistics.median(row[field] for row in rows), 3)


def main() -> None:
    args = parse_args()
    groups: dict[tuple, list[dict]] = {}
    for path in sorted(args.results.glob("*.json")):
        if path.name == args.output.name:
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for row in payload["results"]:
            key = (
                row["scenario"],
                row["mode"],
                row["request_count"],
                row["batch_size"],
                row["workers"],
                row["simulated_work_ms"],
            )
            groups.setdefault(key, []).append(row)

    summary = []
    for key, rows in sorted(groups.items()):
        scenario, mode, requests, batch, workers, work_ms = key
        item = {
            "scenario": scenario,
            "mode": mode,
            "request_count": requests,
            "batch_size": batch,
            "workers": workers,
            "simulated_work_ms": work_ms,
            "repetitions": len(rows),
            "lock_conflicts_total": sum(row["lock_conflicts"] for row in rows),
        }
        item.update({f"{field}_median": median(rows, field) for field in FIELDS})
        summary.append(item)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"summary": summary}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    csv_path = args.output.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=summary[0].keys())
        writer.writeheader()
        writer.writerows(summary)


if __name__ == "__main__":
    main()
