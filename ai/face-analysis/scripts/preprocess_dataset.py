"""Build the approved label manifest and aligned local training images."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import cv2

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.dataset import (  # noqa: E402
    MANIFEST_COLUMNS,
    build_manifest,
    decode_image,
    write_csv,
)
from face_analysis.preprocessing import (  # noqa: E402
    FaceQualityError,
    align_face,
    create_detector,
    detect_single_face,
    quality_issues,
)


REPORT_COLUMNS = (
    *MANIFEST_COLUMNS,
    "processed_path",
    "face_confidence",
    "face_ratio",
    "brightness_score",
    "blur_score",
    "roll_degrees",
    "training_eligible",
    "review_reason",
)


def _write_image(path: Path, image: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise OSError(f"정렬 이미지를 인코딩할 수 없습니다: {path}")
    encoded.tofile(path)


def preprocess(args: argparse.Namespace) -> list[dict[str, Any]]:
    data_root = args.data_root.resolve()
    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve()
    if output_dir == source_dir or output_dir.is_relative_to(source_dir):
        raise ValueError("전처리 출력은 원본 사진데이터 폴더 밖에 있어야 합니다.")

    manifest = build_manifest(data_root, source_dir, args.images_per_person)
    write_csv(args.manifest, MANIFEST_COLUMNS, manifest)
    detector = create_detector(args.face_model, args.detection_threshold)
    report_rows: list[dict[str, Any]] = []

    for row in manifest:
        report = dict(row)
        report.update(
            {
                "processed_path": "",
                "face_confidence": "",
                "face_ratio": "",
                "brightness_score": "",
                "blur_score": "",
                "roll_degrees": "",
                "training_eligible": False,
                "review_reason": "",
            }
        )
        try:
            source_path = data_root / str(row["source_path"])
            image = decode_image(source_path)
            detection = detect_single_face(
                image, detector, args.min_detection_area_ratio
            )
            aligned, quality = align_face(image, detection, args.output_size)
            issues = quality_issues(quality)
            relative_output = (
                Path("processed")
                / str(row["analysis_group"])
                / str(row["face_type"])
                / str(row["person_id"])
                / f"{row['sample_id']}.jpg"
            )
            output_path = data_root / relative_output
            if not output_path.resolve().is_relative_to(output_dir):
                raise ValueError(
                    f"출력 경로가 output_dir을 벗어났습니다: {output_path}"
                )
            _write_image(output_path, aligned)
            report.update(quality.as_dict())
            report["processed_path"] = relative_output.as_posix()
            report["training_eligible"] = not issues
            report["review_reason"] = "|".join(issues)
        except FaceQualityError as exc:
            report["review_reason"] = exc.code
        report_rows.append(report)

    write_csv(args.report, REPORT_COLUMNS, report_rows)
    return report_rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--source-dir", type=Path, default=Path("data/사진데이터"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/processed"))
    parser.add_argument(
        "--manifest", type=Path, default=Path("data/dataset_manifest.csv")
    )
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument(
        "--face-model",
        type=Path,
        default=Path("artifacts/face_detection_yunet_2023mar.onnx"),
    )
    parser.add_argument("--images-per-person", type=int, default=3)
    parser.add_argument("--output-size", type=int, default=224)
    parser.add_argument("--detection-threshold", type=float, default=0.78)
    parser.add_argument("--min-detection-area-ratio", type=float, default=0.01)
    return parser.parse_args()


if __name__ == "__main__":
    rows = preprocess(parse_args())
    eligible = sum(str(row["training_eligible"]).lower() == "true" for row in rows)
    reasons: dict[str, int] = {}
    for row in rows:
        reason = str(row["review_reason"] or "usable")
        reasons[reason] = reasons.get(reason, 0) + 1
    print(
        f"processed={len(rows)} training_eligible={eligible} review={len(rows) - eligible}"
    )
    for reason, count in sorted(reasons.items()):
        print(f"{reason}: {count}")
