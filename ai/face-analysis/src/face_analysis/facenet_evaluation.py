"""Person-disjoint evaluation for no-training FaceNet512 similarity."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .evaluation import (
    PredictionRecord,
    build_person_disjoint_folds,
    calibrate_abstention_policy,
    evaluate_predictions,
)
from .facenet import (
    GROUP_CENTERED_CLASS_CENTROID,
    PERSON_SIMILARITY_MEAN,
    FaceEmbedder,
    ReferenceSample,
    SimilarityScoringMethod,
    build_reference_memory,
    extract_reference_features,
    face_type_relative_scores,
)
from .inference import PredictionPolicy


@dataclass(frozen=True)
class FaceNetEvaluationConfig:
    batch_size: int = 16
    folds: int = 4
    similarity_top_k: int = 4
    similarity_temperature: float = 0.20
    similarity_scoring_method: SimilarityScoringMethod = (
        GROUP_CENTERED_CLASS_CENTROID
    )
    baseline_scoring_method: SimilarityScoringMethod = PERSON_SIMILARITY_MEAN
    success_threshold: float = 0.30
    minimum_margin: float = 0.08
    second_suggestion_threshold: float = 0.25
    minimum_calibration_coverage: float = 0.2
    target_confirmed_accuracy: float = 0.7


def run_facenet_cross_validation(
    samples: list[ReferenceSample],
    embedder: FaceEmbedder,
    config: FaceNetEvaluationConfig | None = None,
) -> dict[str, Any]:
    settings = config or FaceNetEvaluationConfig()
    folds = build_person_disjoint_folds(samples, settings.folds)  # type: ignore[arg-type]
    features = extract_reference_features(embedder, samples, settings.batch_size)
    policy = PredictionPolicy(
        success_threshold=settings.success_threshold,
        minimum_margin=settings.minimum_margin,
        second_suggestion_threshold=settings.second_suggestion_threshold,
    )
    all_predictions: list[PredictionRecord] = []
    all_baseline_predictions: list[PredictionRecord] = []
    fold_reports: list[dict[str, Any]] = []

    for fold in folds:
        references = build_reference_memory(fold.training, features)
        predictions: list[PredictionRecord] = []
        baseline_predictions: list[PredictionRecord] = []
        for sample in fold.validation:
            scores = face_type_relative_scores(
                features[sample.image_path],
                sample.analysis_group,
                references,
                top_k=settings.similarity_top_k,
                temperature=settings.similarity_temperature,
                scoring_method=settings.similarity_scoring_method,
            )
            baseline_scores = face_type_relative_scores(
                features[sample.image_path],
                sample.analysis_group,
                references,
                top_k=settings.similarity_top_k,
                temperature=settings.similarity_temperature,
                scoring_method=settings.baseline_scoring_method,
            )
            predictions.append(
                PredictionRecord(
                    sample.analysis_group,
                    sample.target,
                    tuple(float(value) for value in scores),
                )
            )
            baseline_predictions.append(
                PredictionRecord(
                    sample.analysis_group,
                    sample.target,
                    tuple(float(value) for value in baseline_scores),
                )
            )
        all_predictions.extend(predictions)
        all_baseline_predictions.extend(baseline_predictions)
        metrics = evaluate_predictions(predictions, policy)
        baseline_metrics = evaluate_predictions(baseline_predictions, policy)
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
                "baselineMetrics": {
                    key: baseline_metrics[key]
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
        del references

    aggregate = evaluate_predictions(all_predictions, policy)
    baseline_aggregate = evaluate_predictions(all_baseline_predictions, policy)
    policy_sweep = []
    for threshold in (0.16, 0.18, 0.20, 0.22, 0.25, 0.30, 0.35, 0.45):
        for margin in (0.0, 0.01, 0.02, 0.03, 0.05, 0.08):
            candidate = PredictionPolicy(
                success_threshold=threshold,
                minimum_margin=margin,
                second_suggestion_threshold=settings.second_suggestion_threshold,
            )
            metrics = evaluate_predictions(all_predictions, candidate)
            policy_sweep.append(
                {
                    "successThreshold": threshold,
                    "minimumMargin": margin,
                    "coverage": metrics["coverage"],
                    "abstentionRatio": metrics["abstentionRatio"],
                    "confirmedAccuracy": metrics["confirmedAccuracy"],
                    "wrongConfirmedRate": metrics["wrongConfirmedRate"],
                }
            )
    calibration = calibrate_abstention_policy(
        all_predictions,
        settings.minimum_calibration_coverage,
        settings.target_confirmed_accuracy,
    )
    comparison_metrics = {}
    for key in ("top1HitRate", "top2HitRate", "macroF1"):
        baseline_value = float(baseline_aggregate[key])
        candidate_value = float(aggregate[key])
        comparison_metrics[key] = {
            "baseline": baseline_value,
            "candidate": candidate_value,
            "delta": round(candidate_value - baseline_value, 6),
        }
    del all_predictions, all_baseline_predictions, features
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "evaluationType": "person-disjoint-grouped-4-fold",
        "model": "deepface-facenet512-group-centered-class-centroid-cosine",
        "dataset": {
            "eligibleImages": len(samples),
            "uniquePeople": len({sample.person_id for sample in samples}),
            "weakLabels": True,
        },
        "configuration": asdict(settings),
        "initialPolicy": asdict(policy),
        "folds": fold_reports,
        "aggregateInitial": aggregate,
        "baselineAggregate": baseline_aggregate,
        "comparison": {
            "baselineScoringMethod": settings.baseline_scoring_method,
            "candidateScoringMethod": settings.similarity_scoring_method,
            "rankingMetrics": comparison_metrics,
            "allRankingMetricsImproved": all(
                values["delta"] > 0 for values in comparison_metrics.values()
            ),
        },
        "policySweep": policy_sweep,
        "calibration": calibration,
        "privacy": {
            "featureLifetime": "process-memory-only",
            "persistedImageFeatures": False,
            "persistedPersonCentroids": False,
            "containsIndividualIdentifiers": False,
        },
        "limitations": [
            "FaceNet512 was trained for identity similarity, not face-type truth.",
            "Celebrity reference categories are weak entertainment labels.",
            "Only three training people per class are available in each fold.",
            "The scoring transformation was selected on this exploratory dataset.",
            "Webcam domain performance is not measured by this dataset.",
            "This report does not establish production readiness.",
        ],
    }


def write_facenet_report(report: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
