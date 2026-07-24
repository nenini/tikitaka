"""Memory-only person-balanced face-type prototype evaluation."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import torch
from torch import Tensor, nn
from torch.nn import functional as F
from torch.utils.data import DataLoader

from .evaluation import (
    PredictionRecord,
    build_person_disjoint_folds,
    calibrate_abstention_policy,
    evaluate_predictions,
)
from .inference import PredictionPolicy
from .labels import ANALYSIS_GROUP_LABELS
from .model import _feature_tensor, load_dinov2_backbone
from .training import (
    ProcessedFaceDataset,
    TrainingSample,
    inference_transform,
)


@dataclass(frozen=True)
class PrototypeEvaluationConfig:
    batch_size: int = 16
    folds: int = 4
    temperature: float = 0.07
    minimum_calibration_coverage: float = 0.2
    target_confirmed_accuracy: float = 0.7

    def __post_init__(self) -> None:
        if self.batch_size < 1 or self.folds < 2:
            raise ValueError("batch_size and folds must be positive.")
        if self.temperature <= 0:
            raise ValueError("temperature must be positive.")


def extract_transient_features(
    backbone: nn.Module,
    samples: list[TrainingSample],
    batch_size: int,
    device: torch.device,
) -> dict[Path, Tensor]:
    """Extract normalized DINO features into process memory only."""
    dataset = ProcessedFaceDataset(samples, inference_transform())
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    features: dict[Path, Tensor] = {}
    cursor = 0
    backbone = backbone.to(device).eval()
    with torch.inference_mode():
        for images, _groups, _targets in loader:
            batch = F.normalize(_feature_tensor(backbone(images.to(device))), dim=1)
            for vector in batch.cpu():
                image_path = samples[cursor].image_path
                if image_path in features:
                    raise ValueError("Duplicate processed image path found.")
                features[image_path] = vector
                cursor += 1
    if cursor != len(samples):
        raise AssertionError("Feature extraction did not cover every sample.")
    return features


def build_person_balanced_prototypes(
    samples: tuple[TrainingSample, ...] | list[TrainingSample],
    features: dict[Path, Tensor],
) -> dict[str, Tensor]:
    """Average images per person before averaging people per face type."""
    person_vectors: dict[tuple[str, str, str], list[Tensor]] = {}
    for sample in samples:
        try:
            vector = features[sample.image_path]
        except KeyError as exc:
            raise ValueError("A training feature is missing.") from exc
        key = (sample.analysis_group, sample.face_type, sample.person_id)
        person_vectors.setdefault(key, []).append(vector)

    class_people: dict[tuple[str, str], list[Tensor]] = {}
    for (group, face_type, _person_id), vectors in person_vectors.items():
        person_mean = F.normalize(torch.stack(vectors).mean(dim=0), dim=0)
        class_people.setdefault((group, face_type), []).append(person_mean)

    prototypes: dict[str, Tensor] = {}
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        class_vectors: list[Tensor] = []
        for face_type in labels:
            people = class_people.get((group, face_type))
            if not people:
                raise ValueError(f"No training people found for {group}/{face_type}.")
            class_vectors.append(F.normalize(torch.stack(people).mean(dim=0), dim=0))
        prototypes[group] = torch.stack(class_vectors)
    return prototypes


def collect_prototype_predictions(
    samples: tuple[TrainingSample, ...],
    features: dict[Path, Tensor],
    prototypes: dict[str, Tensor],
    temperature: float,
) -> list[PredictionRecord]:
    records: list[PredictionRecord] = []
    for sample in samples:
        try:
            vector = features[sample.image_path]
            group_prototypes = prototypes[sample.analysis_group]
        except KeyError as exc:
            raise ValueError("A validation feature or group prototype is missing.") from exc
        similarities = group_prototypes @ vector
        relative_scores = torch.softmax(similarities / temperature, dim=0)
        records.append(
            PredictionRecord(
                analysis_group=sample.analysis_group,
                target=sample.target,
                probabilities=tuple(float(value) for value in relative_scores),
            )
        )
    return records


def run_prototype_cross_validation(
    samples: list[TrainingSample],
    device: torch.device,
    torch_hub_dir: Path,
    config: PrototypeEvaluationConfig | None = None,
) -> dict[str, Any]:
    settings = config or PrototypeEvaluationConfig()
    folds = build_person_disjoint_folds(samples, settings.folds)
    backbone = load_dinov2_backbone(str(torch_hub_dir))
    features = extract_transient_features(
        backbone,
        samples,
        settings.batch_size,
        device,
    )
    policy = PredictionPolicy()
    all_predictions: list[PredictionRecord] = []
    fold_reports: list[dict[str, Any]] = []
    for fold in folds:
        prototypes = build_person_balanced_prototypes(fold.training, features)
        predictions = collect_prototype_predictions(
            fold.validation,
            features,
            prototypes,
            settings.temperature,
        )
        all_predictions.extend(predictions)
        metrics = evaluate_predictions(predictions, policy)
        fold_reports.append(
            {
                "fold": fold.index + 1,
                "trainingImages": len(fold.training),
                "validationImages": len(fold.validation),
                "trainingPeople": len({item.person_id for item in fold.training}),
                "validationPeople": len({item.person_id for item in fold.validation}),
                "metrics": {
                    key: metrics[key]
                    for key in (
                        "top1HitRate",
                        "top2HitRate",
                        "macroF1",
                        "coverage",
                        "abstentionRatio",
                        "confirmedAccuracy",
                        "wrongConfirmedRate",
                    )
                },
            }
        )
        del prototypes

    aggregate = evaluate_predictions(all_predictions, policy)
    calibration = calibrate_abstention_policy(
        all_predictions,
        settings.minimum_calibration_coverage,
        settings.target_confirmed_accuracy,
    )
    # Explicitly release all transient image/person features before returning a report.
    del all_predictions, features
    if device.type == "cuda":
        torch.cuda.empty_cache()
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "evaluationType": "person-disjoint-grouped-4-fold",
        "model": "dinov2_vits14-person-balanced-class-prototype-cosine",
        "dataset": {
            "eligibleImages": len(samples),
            "uniquePeople": len({sample.person_id for sample in samples}),
            "weakLabels": True,
        },
        "configuration": asdict(settings),
        "initialPolicy": asdict(policy),
        "folds": fold_reports,
        "aggregateInitial": aggregate,
        "calibration": calibration,
        "privacy": {
            "featureLifetime": "process-memory-only",
            "persistedImageFeatures": False,
            "persistedPersonPrototypes": False,
            "containsIndividualIdentifiers": False,
        },
        "limitations": [
            "Celebrity reference labels are weak labels, not objective ground truth.",
            "Only three training people per class are available in each fold.",
            "Threshold calibration and reporting use the same out-of-fold predictions.",
            "Webcam domain performance is not measured by this dataset.",
            "This report does not establish production readiness.",
        ],
    }


def compare_with_linear_baseline(
    baseline: dict[str, Any],
    prototype: dict[str, Any],
    minimum_gain: float = 0.02,
) -> dict[str, Any]:
    """Apply a conservative aggregate-only replacement gate."""
    baseline_metrics = baseline["aggregateInitial"]
    prototype_metrics = prototype["aggregateInitial"]
    gains = {
        key: round(prototype_metrics[key] - baseline_metrics[key], 6)
        for key in ("top1HitRate", "top2HitRate", "macroF1")
    }
    replace = (
        gains["top1HitRate"] >= minimum_gain
        and gains["macroF1"] >= minimum_gain
        and gains["top2HitRate"] >= 0.0
    )
    return {
        "minimumRequiredGain": minimum_gain,
        "metricGains": gains,
        "replacementRecommended": replace,
        "reason": (
            "Prototype passed the aggregate replacement gate."
            if replace
            else "Prototype did not pass every aggregate replacement criterion."
        ),
    }


def write_prototype_comparison_report(
    baseline: dict[str, Any],
    prototype: dict[str, Any],
    output_path: Path,
) -> dict[str, Any]:
    decision = compare_with_linear_baseline(baseline, prototype)
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "baseline": {
            "model": baseline["model"],
            "metrics": baseline["aggregateInitial"],
        },
        "candidate": prototype,
        "replacementDecision": decision,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report
