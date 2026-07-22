"""Frozen DINOv2 backbone with explicit analysis-group classifier heads."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import torch
from torch import Tensor, nn

from .labels import ANALYSIS_GROUP_LABELS, normalize_analysis_group


DINO_REPOSITORY = "facebookresearch/dinov2"
DINO_MODEL_NAME = "dinov2_vits14"
CHECKPOINT_FORMAT_VERSION = 1


@dataclass(frozen=True)
class ClassifierConfig:
    backbone_name: str = DINO_MODEL_NAME
    feature_dim: int = 384
    projection_dim: int = 192
    dropout: float = 0.2


@lru_cache(maxsize=1)
def load_dinov2_backbone() -> nn.Module:
    """Download/cache DINOv2 once and reuse the frozen process-local instance."""
    backbone = torch.hub.load(
        DINO_REPOSITORY,
        DINO_MODEL_NAME,
        pretrained=True,
        trust_repo=True,
        verbose=False,
    )
    backbone.eval()
    backbone.requires_grad_(False)
    return backbone


def _feature_tensor(output: Any) -> Tensor:
    if isinstance(output, Tensor):
        return output
    if isinstance(output, dict) and isinstance(output.get("x_norm_clstoken"), Tensor):
        return output["x_norm_clstoken"]
    raise TypeError("DINOv2 backbone output must contain one feature tensor.")


class FaceTypeClassifier(nn.Module):
    """Shared projection and separate heads for explicitly selected groups."""

    def __init__(self, backbone: nn.Module, config: ClassifierConfig | None = None) -> None:
        super().__init__()
        self.config = config or ClassifierConfig()
        self.backbone = backbone
        self.backbone.requires_grad_(False)
        self.backbone.eval()
        self.projection = nn.Sequential(
            nn.LayerNorm(self.config.feature_dim),
            nn.Linear(self.config.feature_dim, self.config.projection_dim),
            nn.GELU(),
            nn.Dropout(self.config.dropout),
        )
        self.heads = nn.ModuleDict(
            {
                group: nn.Linear(self.config.projection_dim, len(labels))
                for group, labels in ANALYSIS_GROUP_LABELS.items()
            }
        )

    def train(self, mode: bool = True) -> FaceTypeClassifier:
        super().train(mode)
        self.backbone.eval()
        return self

    def encode(self, images: Tensor) -> Tensor:
        """Create transient features; callers must not persist or transmit them."""
        with torch.no_grad():
            features = _feature_tensor(self.backbone(images))
        if features.ndim != 2 or features.shape[1] != self.config.feature_dim:
            raise ValueError(
                "Unexpected backbone feature shape: "
                f"{tuple(features.shape)} (expected [batch, {self.config.feature_dim}])"
            )
        return features

    def forward(self, images: Tensor, analysis_group: str) -> Tensor:
        group = normalize_analysis_group(analysis_group)
        features = self.encode(images)
        return self.heads[group](self.projection(features))

    def trainable_parameters(self) -> list[nn.Parameter]:
        return [parameter for parameter in self.parameters() if parameter.requires_grad]


def save_classifier_checkpoint(model: FaceTypeClassifier, path: Path) -> None:
    """Save classifier weights and metadata only, never per-face features."""
    path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "config": asdict(model.config),
        "labels": {group: list(labels) for group, labels in ANALYSIS_GROUP_LABELS.items()},
        "projection_state": model.projection.state_dict(),
        "head_state": model.heads.state_dict(),
    }
    torch.save(checkpoint, path)


def load_classifier_checkpoint(
    backbone: nn.Module,
    path: Path,
    *,
    map_location: str | torch.device = "cpu",
) -> FaceTypeClassifier:
    checkpoint = torch.load(path, map_location=map_location, weights_only=True)
    if checkpoint.get("format_version") != CHECKPOINT_FORMAT_VERSION:
        raise ValueError("Unsupported classifier checkpoint format.")
    expected_labels = {
        group: list(labels) for group, labels in ANALYSIS_GROUP_LABELS.items()
    }
    if checkpoint.get("labels") != expected_labels:
        raise ValueError("Checkpoint label order does not match the service label contract.")
    config = ClassifierConfig(**checkpoint["config"])
    if config.backbone_name != DINO_MODEL_NAME:
        raise ValueError(f"Unsupported backbone: {config.backbone_name}")
    model = FaceTypeClassifier(backbone, config)
    model.projection.load_state_dict(checkpoint["projection_state"])
    model.heads.load_state_dict(checkpoint["head_state"])
    return model
