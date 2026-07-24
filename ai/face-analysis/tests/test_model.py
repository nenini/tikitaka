from __future__ import annotations

from pathlib import Path

import torch
from torch import nn

from face_analysis.model import (
    ClassifierConfig,
    FaceTypeClassifier,
    load_classifier_checkpoint,
    save_classifier_checkpoint,
)


class FakeBackbone(nn.Module):
    def forward(self, images: torch.Tensor) -> torch.Tensor:
        pooled = images.mean(dim=(2, 3))
        return torch.cat((pooled, pooled[:, :1]), dim=1)


def make_model() -> FaceTypeClassifier:
    return FaceTypeClassifier(
        FakeBackbone(),
        ClassifierConfig(
            backbone_name="dinov2_vits14",
            feature_dim=4,
            projection_dim=3,
            dropout=0.0,
        ),
    )


def test_group_heads_have_the_approved_output_sizes() -> None:
    model = make_model()
    images = torch.ones((2, 3, 8, 8))
    assert model(images, "female").shape == (2, 9)
    assert model(images, "male").shape == (2, 8)
    assert all(not parameter.requires_grad for parameter in model.backbone.parameters())


def test_checkpoint_contains_heads_but_no_backbone_or_features(tmp_path: Path) -> None:
    path = tmp_path / "head.pt"
    model = make_model()
    save_classifier_checkpoint(model, path)
    checkpoint = torch.load(path, weights_only=True)
    assert "projection_state" in checkpoint
    assert "head_state" in checkpoint
    assert "backbone_state" not in checkpoint
    assert all("embedding" not in key for key in checkpoint)

    restored = load_classifier_checkpoint(FakeBackbone(), path)
    restored.eval()
    model.eval()
    images = torch.ones((1, 3, 8, 8))
    assert torch.equal(model(images, "female"), restored(images, "female"))
