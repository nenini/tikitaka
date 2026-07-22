"""Render paginated aligned-face contact sheets for local manual review."""

from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import cv2
import numpy as np


def _read_image(path: Path) -> np.ndarray | None:
    return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument(
        "--output-dir", type=Path, default=Path("artifacts/processed_contact")
    )
    parser.add_argument("--columns", type=int, default=12)
    parser.add_argument("--rows", type=int, default=6)
    parser.add_argument("--tile-size", type=int, default=112)
    return parser.parse_args()


def render(args: argparse.Namespace) -> list[Path]:
    with args.report.open("r", encoding="utf-8-sig", newline="") as handle:
        records = list(csv.DictReader(handle))
    if args.columns <= 0 or args.rows <= 0 or args.tile_size < 64:
        raise ValueError("columns/rows는 양수이고 tile-size는 64 이상이어야 합니다.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    page_size = args.columns * args.rows
    page_count = max(1, math.ceil(len(records) / page_size))
    label_height = 25
    outputs: list[Path] = []
    for page_index in range(page_count):
        page = records[page_index * page_size : (page_index + 1) * page_size]
        canvas = np.full(
            (
                args.rows * (args.tile_size + label_height),
                args.columns * args.tile_size,
                3,
            ),
            245,
            dtype=np.uint8,
        )
        for index, row in enumerate(page):
            path = args.data_root / row["processed_path"]
            image = _read_image(path)
            if image is None:
                continue
            image = cv2.resize(
                image, (args.tile_size, args.tile_size), interpolation=cv2.INTER_AREA
            )
            x = (index % args.columns) * args.tile_size
            y = (index // args.columns) * (args.tile_size + label_height)
            canvas[y : y + args.tile_size, x : x + args.tile_size] = image
            eligible = row["training_eligible"].strip().lower() == "true"
            color = (0, 110, 0) if eligible else (0, 0, 190)
            cv2.putText(
                canvas,
                row["sample_id"][-12:],
                (x + 3, y + args.tile_size + 17),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.31,
                color,
                1,
                cv2.LINE_AA,
            )
        output = args.output_dir / f"processed_contact_{page_index + 1:02d}.jpg"
        success, encoded = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise RuntimeError(f"contact sheet 인코딩 실패: {output}")
        encoded.tofile(output)
        outputs.append(output)
    return outputs


if __name__ == "__main__":
    paths = render(parse_args())
    print(f"Wrote {len(paths)} contact sheets")
    for path in paths:
        print(path)
