from __future__ import annotations

from collections import Counter
from pathlib import Path

from face_analysis.evaluation import (
    PredictionRecord,
    build_person_disjoint_folds,
    calibrate_abstention_policy,
    evaluate_predictions,
)
from face_analysis.inference import PredictionPolicy
from face_analysis.labels import ANALYSIS_GROUP_LABELS
from face_analysis.training import load_training_samples


ROOT = Path(__file__).resolve().parents[1]


def test_every_person_is_validation_once_without_training_overlap() -> None:
    samples = load_training_samples(
        ROOT / "data",
        ROOT / "data" / "processing_report.csv",
    )
    folds = build_person_disjoint_folds(samples)
    validation_counts: Counter[str] = Counter()
    for fold in folds:
        training_people = {sample.person_id for sample in fold.training}
        validation_people = {sample.person_id for sample in fold.validation}
        assert training_people.isdisjoint(validation_people)
        validation_counts.update(validation_people)
        bucket_counts = Counter(
            (sample.analysis_group, sample.face_type, sample.person_id)
            for sample in fold.validation
        )
        people_per_bucket = Counter(
            (group, face_type) for group, face_type, _person in bucket_counts
        )
        assert all(value == 1 for value in people_per_bucket.values())
        assert len(people_per_bucket) == 17
    assert len(validation_counts) == 68
    assert set(validation_counts.values()) == {1}


def perfect_records() -> list[PredictionRecord]:
    records: list[PredictionRecord] = []
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        for target in range(len(labels)):
            probabilities = [0.01 for _ in labels]
            probabilities[target] = 0.92
            records.append(PredictionRecord(group, target, tuple(probabilities)))
    return records


def test_metrics_are_correct_for_perfect_group_specific_predictions() -> None:
    metrics = evaluate_predictions(perfect_records(), PredictionPolicy())
    assert metrics["top1HitRate"] == 1.0
    assert metrics["top2HitRate"] == 1.0
    assert metrics["macroF1"] == 1.0
    assert metrics["coverage"] == 1.0
    assert metrics["abstentionRatio"] == 0.0
    assert metrics["confirmedAccuracy"] == 1.0
    assert metrics["wrongConfirmedRate"] == 0.0


def test_calibration_returns_exploratory_thresholds() -> None:
    calibration = calibrate_abstention_policy(perfect_records())
    assert calibration["targetMet"] is True
    assert calibration["recommendationAvailable"] is True
    assert calibration["exploratoryOnly"] is True
    assert calibration["coverage"] == 1.0
    assert calibration["confirmedAccuracy"] == 1.0
