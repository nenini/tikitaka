"""Run aggregate-only person-disjoint cross-validation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.evaluation import (  # noqa: E402
    EvaluationConfig,
    run_cross_validation,
    write_evaluation_reports,
)
from face_analysis.training import load_training_samples  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument("--output-dir", type=Path, default=Path("reports"))
    parser.add_argument(
        "--torch-hub-dir", type=Path, default=Path("artifacts/torch-cache/hub")
    )
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--seed", type=int, default=307)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    return parser.parse_args()


def resolve_device(value: str) -> torch.device:
    if value == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available.")
    if value == "auto":
        value = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(value)


def main(args: argparse.Namespace) -> None:
    if args.epochs < 1 or args.batch_size < 1:
        raise ValueError("epochs and batch-size must be positive.")
    samples = load_training_samples(args.data_root, args.report)
    config = EvaluationConfig(
        epochs=args.epochs,
        batch_size=args.batch_size,
        seed=args.seed,
    )
    result = run_cross_validation(
        samples,
        resolve_device(args.device),
        args.torch_hub_dir,
        config,
    )
    json_path = args.output_dir / "person_disjoint_evaluation.json"
    markdown_path = args.output_dir / "person_disjoint_evaluation.md"
    write_evaluation_reports(result, json_path, markdown_path)
    initial = result["aggregateInitial"]
    print(
        "evaluation_complete "
        f"top1={initial['top1HitRate']:.6f} "
        f"top2={initial['top2HitRate']:.6f} "
        f"macro_f1={initial['macroF1']:.6f}"
    )
    print(f"json_report={json_path}")
    print(f"markdown_report={markdown_path}")


if __name__ == "__main__":
    main(parse_args())
