"""Compare memory-only face-type prototypes with the linear-head baseline."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.prototype_evaluation import (  # noqa: E402
    PrototypeEvaluationConfig,
    run_prototype_cross_validation,
    write_prototype_comparison_report,
)
from face_analysis.training import load_training_samples  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path("reports/person_disjoint_evaluation.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("reports/prototype_comparison.json"),
    )
    parser.add_argument(
        "--torch-hub-dir", type=Path, default=Path("artifacts/torch-cache/hub")
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--temperature", type=float, default=0.07)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    return parser.parse_args()


def resolve_device(value: str) -> torch.device:
    if value == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available.")
    if value == "auto":
        value = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(value)


def main(args: argparse.Namespace) -> None:
    if not args.baseline.is_file():
        raise FileNotFoundError("The linear-head baseline report is missing.")
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    samples = load_training_samples(args.data_root, args.report)
    candidate = run_prototype_cross_validation(
        samples,
        resolve_device(args.device),
        args.torch_hub_dir,
        PrototypeEvaluationConfig(
            batch_size=args.batch_size,
            temperature=args.temperature,
        ),
    )
    comparison = write_prototype_comparison_report(
        baseline,
        candidate,
        args.output,
    )
    metrics = candidate["aggregateInitial"]
    decision = comparison["replacementDecision"]
    print(
        "prototype_evaluation_complete "
        f"top1={metrics['top1HitRate']:.6f} "
        f"top2={metrics['top2HitRate']:.6f} "
        f"macro_f1={metrics['macroF1']:.6f}"
    )
    print(f"replacement_recommended={decision['replacementRecommended']}")
    print(f"comparison_report={args.output}")


if __name__ == "__main__":
    main(parse_args())
