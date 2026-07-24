"""Training utilities that never cache or serialize face feature vectors."""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
import torch
from torch import Tensor
from torch.nn import functional as F
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

from .labels import labels_for_group
from .model import FaceTypeClassifier


@dataclass(frozen=True)
class TrainingSample:
    image_path: Path
    person_id: str
    analysis_group: str
    face_type: str
    target: int


def inference_transform() -> Callable[[np.ndarray], Tensor]:
    return transforms.Compose(
        [
            transforms.ToPILImage(),
            transforms.Resize((224, 224), antialias=True),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=(0.485, 0.456, 0.406),
                std=(0.229, 0.224, 0.225),
            ),
        ]
    )


def training_transform() -> Callable[[np.ndarray], Tensor]:
    return transforms.Compose(
        [
            transforms.ToPILImage(),
            transforms.Resize((224, 224), antialias=True),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.05),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=(0.485, 0.456, 0.406),
                std=(0.229, 0.224, 0.225),
            ),
        ]
    )


def _read_rgb(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("A processed training image could not be decoded.")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def load_training_samples(data_root: Path, report_path: Path) -> list[TrainingSample]:
    data_root = data_root.resolve()
    samples: list[TrainingSample] = []
    with report_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if str(row.get("training_eligible", "")).strip().lower() != "true":
                continue
            relative_path = Path(str(row.get("processed_path", "")))
            image_path = (data_root / relative_path).resolve()
            if not image_path.is_relative_to(data_root):
                raise ValueError("A processed image path escapes data_root.")
            if not image_path.is_file():
                raise FileNotFoundError("A processed training image is missing.")
            group = str(row["analysis_group"])
            labels = labels_for_group(group)
            samples.append(
                TrainingSample(
                    image_path=image_path,
                    person_id=str(row["person_id"]),
                    analysis_group=group,
                    face_type=str(row["face_type"]),
                    target=labels.index(str(row["face_type"])),
                )
            )
    if not samples:
        raise ValueError("No eligible processed training images were found.")
    return samples


class ProcessedFaceDataset(Dataset[tuple[Tensor, str, int]]):
    def __init__(
        self,
        samples: list[TrainingSample],
        transform: Callable[[np.ndarray], Tensor] | None = None,
    ) -> None:
        self.samples = list(samples)
        self.transform = transform or training_transform()

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[Tensor, str, int]:
        sample = self.samples[index]
        image = self.transform(_read_rgb(sample.image_path))
        return image, sample.analysis_group, sample.target


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_one_epoch(
    model: FaceTypeClassifier,
    loader: DataLoader[tuple[Tensor, str, Tensor]],
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> float:
    model.train()
    loss_total = 0.0
    sample_total = 0
    for images, groups, targets in loader:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        batch_loss = torch.zeros((), device=device)
        for group in sorted(set(groups)):
            indices = torch.tensor(
                [index for index, value in enumerate(groups) if value == group],
                device=device,
            )
            logits = model(images.index_select(0, indices), group)
            group_loss = F.cross_entropy(logits, targets.index_select(0, indices))
            batch_loss = batch_loss + group_loss * (indices.numel() / len(groups))
        batch_loss.backward()
        optimizer.step()
        loss_total += float(batch_loss.detach()) * len(groups)
        sample_total += len(groups)
    return loss_total / max(sample_total, 1)
