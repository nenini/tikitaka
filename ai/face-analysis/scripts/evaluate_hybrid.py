"""Evaluate geometry-only, geometry-first hybrid, and FaceNet baseline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.facenet import FaceNet512Embedder, load_reference_samples  # noqa: E402
from face_analysis.geometry import MediaPipeGeometryExtractor  # noqa: E402
from face_analysis.hybrid_evaluation import (  # noqa: E402
    HybridEvaluationConfig,
    run_hybrid_cross_validation,
    write_hybrid_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument("--facenet-home", type=Path, default=Path("artifacts"))
    parser.add_argument(
        "--face-landmarker",
        type=Path,
        default=Path("artifacts/face_landmarker.task"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("reports/hybrid_geometry_evaluation.json"),
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--geometry-temperature", type=float, default=1.0)
    parser.add_argument("--geometry-tie-margin", type=float, default=0.02)
    parser.add_argument("--geometry-weight", type=float, default=0.80)
    return parser.parse_args()


def main(args: argparse.Namespace) -> None:
    geometry_extractor = MediaPipeGeometryExtractor(args.face_landmarker)
    facenet_embedder = FaceNet512Embedder(args.facenet_home)
    samples = load_reference_samples(args.data_root, args.report)
    try:
        report = run_hybrid_cross_validation(
            samples,
            geometry_extractor,
            facenet_embedder,
            HybridEvaluationConfig(
                batch_size=args.batch_size,
                geometry_temperature=args.geometry_temperature,
                geometry_tie_margin=args.geometry_tie_margin,
                geometry_weight=args.geometry_weight,
            ),
        )
    finally:
        geometry_extractor.close()
    write_hybrid_report(report, args.output)
    for name in (
        "geometryOnly",
        "geometryFirstHybrid",
        "facenetBaseline",
        "facenetShortlistGeometry",
    ):
        metrics = report[name]
        print(
            f"{name} "
            f"top1={metrics['top1HitRate']:.6f} "
            f"top2={metrics['top2HitRate']:.6f} "
            f"macro_f1={metrics['macroF1']:.6f}"
        )
    print(
        "shortlist_tie_break_ratio="
        f"{report['facenetShortlistTieBreakUsage']['ratio']:.6f}"
    )
    print(f"report={args.output}")


if __name__ == "__main__":
    main(parse_args())
