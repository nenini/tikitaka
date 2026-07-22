"""Validate local source photos and create deterministic label metadata."""

from __future__ import annotations

import csv
import hashlib
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .labels import FACE_TYPE_KO, PEOPLE_BY_FILE_PREFIX, REFERENCE_PEOPLE


MANIFEST_COLUMNS = (
    "sample_id",
    "person_id",
    "display_name",
    "analysis_group",
    "face_type",
    "face_type_ko",
    "sequence",
    "source_path",
    "source_sha256",
    "source_width",
    "source_height",
)
_STEM_PATTERN = re.compile(r"^(?P<prefix>.+?)(?P<sequence>[1-9]\d*)$")
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


class DatasetLayoutError(ValueError):
    """Raised when filenames or reference counts do not match the label table."""


def decode_image(path: Path) -> np.ndarray:
    """Read an image from a Unicode-safe Windows path."""
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise DatasetLayoutError(
            f"손상되었거나 지원하지 않는 이미지입니다: {path.name}"
        )
    return image


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(
    data_root: Path,
    source_dir: Path,
    images_per_person: int = 3,
) -> list[dict[str, Any]]:
    data_root = data_root.resolve()
    source_dir = source_dir.resolve()
    if not source_dir.is_dir():
        raise FileNotFoundError(f"사진 데이터 폴더가 없습니다: {source_dir}")
    if not source_dir.is_relative_to(data_root):
        raise DatasetLayoutError("사진 데이터 폴더는 data_root 내부에 있어야 합니다.")

    grouped: dict[str, list[tuple[int, Path]]] = defaultdict(list)
    unknown_files: list[str] = []
    for path in sorted(source_dir.iterdir(), key=lambda item: item.name):
        if not path.is_file() or path.suffix.lower() not in _IMAGE_SUFFIXES:
            continue
        match = _STEM_PATTERN.fullmatch(path.stem)
        if match is None or match.group("prefix") not in PEOPLE_BY_FILE_PREFIX:
            unknown_files.append(path.name)
            continue
        grouped[match.group("prefix")].append((int(match.group("sequence")), path))
    if unknown_files:
        raise DatasetLayoutError(
            f"라벨표에 없는 파일명이 있습니다: {', '.join(unknown_files)}"
        )

    count_errors: list[str] = []
    for person in REFERENCE_PEOPLE:
        sequences = sorted(
            sequence for sequence, _ in grouped.get(person.file_prefix, [])
        )
        expected = list(range(1, images_per_person + 1))
        if sequences != expected:
            count_errors.append(f"{person.display_name}={sequences or '없음'}")
    if count_errors:
        raise DatasetLayoutError(
            f"각 인물은 1~{images_per_person}번 파일이 정확히 있어야 합니다: "
            + ", ".join(count_errors)
        )

    rows: list[dict[str, Any]] = []
    hashes: dict[str, str] = {}
    for person in REFERENCE_PEOPLE:
        for sequence, path in sorted(grouped[person.file_prefix]):
            digest = sha256_file(path)
            if digest in hashes:
                raise DatasetLayoutError(
                    f"정확히 같은 이미지가 중복되었습니다: {hashes[digest]}, {path.name}"
                )
            hashes[digest] = path.name
            image = decode_image(path)
            height, width = image.shape[:2]
            rows.append(
                {
                    "sample_id": f"{person.person_id}_{sequence:02d}",
                    "person_id": person.person_id,
                    "display_name": person.display_name,
                    "analysis_group": person.analysis_group,
                    "face_type": person.face_type,
                    "face_type_ko": FACE_TYPE_KO[person.face_type],
                    "sequence": sequence,
                    "source_path": path.relative_to(data_root).as_posix(),
                    "source_sha256": digest,
                    "source_width": width,
                    "source_height": height,
                }
            )
    return rows


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
