"""Evaluate no-training FaceNet512 similarity with aggregate-only output."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.facenet import (  # noqa: E402
    GROUP_CENTERED_CLASS_CENTROID,
    SIMILARITY_SCORING_METHODS,
    FaceNet512Embedder,
    load_reference_samples,
)
from face_analysis.facenet_evaluation import (  # noqa: E402
    FaceNetEvaluationConfig,
    run_facenet_cross_validation,
    write_facenet_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument("--facenet-home", type=Path, default=Path("artifacts"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("reports/facenet_similarity_evaluation.json"),
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--top-k", type=int, default=4)
    parser.add_argument("--temperature", type=float, default=0.20)
    parser.add_argument(
        "--scoring-method",
        choices=sorted(SIMILARITY_SCORING_METHODS),
        default=GROUP_CENTERED_CLASS_CENTROID,
    )
    parser.add_argument("--success-threshold", type=float, default=0.30)
    parser.add_argument("--minimum-margin", type=float, default=0.08)
    return parser.parse_args()


def main(args: argparse.Namespace) -> None:
    embedder = FaceNet512Embedder(args.facenet_home)
    samples = load_reference_samples(args.data_root, args.report)
    report = run_facenet_cross_validation(
        samples,
        embedder,
        FaceNetEvaluationConfig(
            batch_size=args.batch_size,
            similarity_top_k=args.top_k,
            similarity_temperature=args.temperature,
            similarity_scoring_method=args.scoring_method,
            success_threshold=args.success_threshold,
            minimum_margin=args.minimum_margin,
        ),
    )
    write_facenet_report(report, args.output)
    metrics = report["aggregateInitial"]
    baseline = report["baselineAggregate"]
    print(
        "facenet_evaluation_complete "
        f"top1={metrics['top1HitRate']:.6f} "
        f"top2={metrics['top2HitRate']:.6f} "
        f"macro_f1={metrics['macroF1']:.6f}"
    )
    print(
        "baseline "
        f"top1={baseline['top1HitRate']:.6f} "
        f"top2={baseline['top2HitRate']:.6f} "
        f"macro_f1={baseline['macroF1']:.6f}"
    )
    print(f"report={args.output}")


if __name__ == "__main__":
    main(parse_args())
