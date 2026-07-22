"""Memory-only inference and the entertainment face-type result contract."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import StrEnum

import cv2
import numpy as np
import torch
from torch import Tensor

from .labels import FACE_TYPE_KO, labels_for_group, normalize_analysis_group
from .model import FaceTypeClassifier
from .training import inference_transform


class AnalysisStatus(StrEnum):
    SUCCESS = "SUCCESS"
    UNCERTAIN = "UNCERTAIN"
    RETAKE_REQUIRED = "RETAKE_REQUIRED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True)
class Suggestion:
    face_type: str
    face_type_ko: str
    confidence: float


@dataclass(frozen=True)
class AnalysisResult:
    status: AnalysisStatus
    analysis_group: str | None
    suggestions: tuple[Suggestion, ...]
    reason_code: str | None = None

    def as_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["status"] = self.status.value
        payload["suggestions"] = [asdict(item) for item in self.suggestions]
        return payload


@dataclass(frozen=True)
class PredictionPolicy:
    success_threshold: float = 0.45
    minimum_margin: float = 0.08
    second_suggestion_threshold: float = 0.25

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1.")


def result_from_probabilities(
    probabilities: Tensor,
    analysis_group: str,
    policy: PredictionPolicy | None = None,
) -> AnalysisResult:
    group = normalize_analysis_group(analysis_group)
    labels = labels_for_group(group)
    values = probabilities.detach().float().cpu().flatten()
    if values.numel() != len(labels):
        raise ValueError("Probability count does not match the selected label space.")
    if not torch.isfinite(values).all() or bool((values < 0).any()):
        raise ValueError("Probabilities must be finite and non-negative.")
    total = float(values.sum())
    if total <= 0:
        raise ValueError("Probability sum must be positive.")
    values = values / total
    rule = policy or PredictionPolicy()
    scores, indices = torch.topk(values, k=min(2, len(labels)))
    top_score = float(scores[0])
    second_score = float(scores[1]) if len(scores) > 1 else 0.0
    confident = (
        top_score >= rule.success_threshold
        and top_score - second_score >= rule.minimum_margin
    )
    suggestion_count = 1
    if confident and second_score >= rule.second_suggestion_threshold:
        suggestion_count = 2
    suggestions = tuple(
        Suggestion(
            face_type=labels[int(index)],
            face_type_ko=FACE_TYPE_KO[labels[int(index)]],
            confidence=round(float(score), 6),
        )
        for score, index in zip(scores[:suggestion_count], indices[:suggestion_count])
    )
    return AnalysisResult(
        status=AnalysisStatus.SUCCESS if confident else AnalysisStatus.UNCERTAIN,
        analysis_group=group,
        suggestions=suggestions,
    )


def skipped_result() -> AnalysisResult:
    return AnalysisResult(AnalysisStatus.SKIPPED, None, (), "user_skipped")


def retake_required_result(analysis_group: str, reason_code: str) -> AnalysisResult:
    return AnalysisResult(
        AnalysisStatus.RETAKE_REQUIRED,
        normalize_analysis_group(analysis_group),
        (),
        reason_code,
    )


class FaceTypePredictor:
    """Long-lived predictor; construct once during application startup."""

    def __init__(
        self,
        model: FaceTypeClassifier,
        device: torch.device,
        policy: PredictionPolicy | None = None,
    ) -> None:
        self.model = model.to(device).eval()
        self.device = device
        self.policy = policy or PredictionPolicy()
        self.transform = inference_transform()

    def predict_aligned_bgr(
        self, aligned_face: np.ndarray, analysis_group: str
    ) -> AnalysisResult:
        if (
            aligned_face is None
            or aligned_face.ndim != 3
            or aligned_face.shape[2] != 3
            or aligned_face.size == 0
        ):
            raise ValueError("aligned_face must be one non-empty BGR image.")
        rgb = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2RGB)
        image = self.transform(rgb).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            logits = self.model(image, analysis_group)
            probabilities = torch.softmax(logits[0], dim=0)
        return result_from_probabilities(probabilities, analysis_group, self.policy)
