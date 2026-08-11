"""Train only the DINOv2 projection and group-specific classifier heads."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from face_analysis.model import (  # noqa: E402
    FaceTypeClassifier,
    load_dinov2_backbone,
    save_classifier_checkpoint,
)
from face_analysis.training import (  # noqa: E402
    ProcessedFaceDataset,
    load_training_samples,
    seed_everything,
    train_one_epoch,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--report", type=Path, default=Path("data/processing_report.csv")
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/face_type_head_experimental.pt"),
    )
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
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
    seed_everything(args.seed)
    device = resolve_device(args.device)
    samples = load_training_samples(args.data_root, args.report)
    dataset = ProcessedFaceDataset(samples)
    loader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )
    model = FaceTypeClassifier(load_dinov2_backbone()).to(device)
    optimizer = torch.optim.AdamW(
        model.trainable_parameters(),
        lr=args.learning_rate,
        weight_decay=args.weight_decay,
    )
    print(f"device={device.type} eligible_samples={len(samples)}")
    for epoch in range(1, args.epochs + 1):
        loss = train_one_epoch(model, loader, optimizer, device)
        print(f"epoch={epoch}/{args.epochs} loss={loss:.6f}")
    save_classifier_checkpoint(model, args.output)
    print(f"classifier_checkpoint={args.output}")


if __name__ == "__main__":
    main(parse_args())
