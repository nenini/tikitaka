from __future__ import annotations

from pathlib import Path

import torch

from face_analysis.prototype_evaluation import (
    build_person_balanced_prototypes,
    collect_prototype_predictions,
    compare_with_linear_baseline,
)
from face_analysis.training import TrainingSample


def sample(
    path: str,
    person: str,
    group: str = "female",
    face_type: str = "dog",
    target: int = 0,
) -> TrainingSample:
    return TrainingSample(Path(path), person, group, face_type, target)


def test_person_balancing_prevents_extra_images_from_changing_class_weight() -> None:
    samples = [
        sample("a1", "a"),
        sample("a2", "a"),
        sample("b1", "b"),
    ]
    features = {
        Path("a1"): torch.tensor([1.0, 0.0]),
        Path("a2"): torch.tensor([1.0, 0.0]),
        Path("b1"): torch.tensor([0.0, 1.0]),
    }
    # Fill other required class/group buckets with one synthetic person each.
    from face_analysis.labels import ANALYSIS_GROUP_LABELS

    for group, labels in ANALYSIS_GROUP_LABELS.items():
        for target, face_type in enumerate(labels):
            if group == "female" and face_type == "dog":
                continue
            path = Path(f"{group}-{face_type}")
            samples.append(sample(str(path), f"p-{group}-{face_type}", group, face_type, target))
            features[path] = torch.tensor([1.0, 1.0])

    prototypes = build_person_balanced_prototypes(samples, features)
    expected = torch.tensor([2**-0.5, 2**-0.5])
    assert torch.allclose(prototypes["female"][0], expected, atol=1e-6)


def test_prototype_prediction_uses_group_specific_cosine_ranking() -> None:
    validation = (sample("query", "q"),)
    features = {Path("query"): torch.tensor([1.0, 0.0])}
    prototypes = {
        "female": torch.vstack(
            (torch.tensor([1.0, 0.0]), torch.zeros((8, 2)))
        ),
    }
    records = collect_prototype_predictions(validation, features, prototypes, 0.07)
    assert len(records) == 1
    assert max(range(9), key=records[0].probabilities.__getitem__) == 0
    assert abs(sum(records[0].probabilities) - 1.0) < 1e-6


def test_replacement_gate_requires_joint_material_improvement() -> None:
    baseline = {
        "aggregateInitial": {
            "top1HitRate": 0.10,
            "top2HitRate": 0.25,
            "macroF1": 0.09,
        }
    }
    candidate = {
        "aggregateInitial": {
            "top1HitRate": 0.14,
            "top2HitRate": 0.26,
            "macroF1": 0.12,
        }
    }
    assert compare_with_linear_baseline(baseline, candidate)[
        "replacementRecommended"
    ] is True
    candidate["aggregateInitial"]["top2HitRate"] = 0.24
    assert compare_with_linear_baseline(baseline, candidate)[
        "replacementRecommended"
    ] is False
