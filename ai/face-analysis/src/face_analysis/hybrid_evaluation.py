"""Person-disjoint aggregate evaluation for geometry-first similarity."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .evaluation import (
    PredictionRecord,
    build_person_disjoint_folds,
    evaluate_predictions,
)
from .facenet import (
    FaceEmbedder,
    ReferenceSample,
    build_reference_memory,
    extract_reference_features,
    face_type_relative_scores,
)
from .geometry import (
    GeometryExtractor,
    build_geometry_reference_memory,
    extract_reference_geometry,
    geometry_relative_scores,
)
from .hybrid import (
    facenet_shortlist_geometry_scores,
    geometry_first_scores,
)
from .inference import PredictionPolicy


@dataclass(frozen=True)
class HybridEvaluationConfig:
    batch_size: int = 16
    folds: int = 4
    geometry_temperature: float = 1.0
    geometry_tie_margin: float = 0.02
    geometry_weight: float = 0.80
    facenet_temperature: float = 0.20
    success_threshold: float = 0.30
    minimum_margin: float = 0.08
    second_suggestion_threshold: float = 0.25


def _record(
    sample: ReferenceSample,
    probabilities: Any,
) -> PredictionRecord:
    return PredictionRecord(
        sample.analysis_group,
        sample.target,
        tuple(float(value) for value in probabilities),
    )


def run_hybrid_cross_validation(
    samples: list[ReferenceSample],
    geometry_extractor: GeometryExtractor,
    facenet_embedder: FaceEmbedder,
    config: HybridEvaluationConfig | None = None,
) -> dict[str, Any]:
    settings = config or HybridEvaluationConfig()
    folds = build_person_disjoint_folds(samples, settings.folds)  # type: ignore[arg-type]
    geometry_features = extract_reference_geometry(
        geometry_extractor,
        samples,
        settings.batch_size,
    )
    facenet_features = extract_reference_features(
        facenet_embedder,
        samples,
        settings.batch_size,
    )
    policy = PredictionPolicy(
        settings.success_threshold,
        settings.minimum_margin,
        settings.second_suggestion_threshold,
    )
    geometry_records: list[PredictionRecord] = []
    hybrid_records: list[PredictionRecord] = []
    facenet_records: list[PredictionRecord] = []
    shortlist_records: list[PredictionRecord] = []
    score_pairs: list[
        tuple[ReferenceSample, tuple[float, ...], tuple[float, ...]]
    ] = []
    tie_break_count = 0
    shortlist_tie_break_count = 0

    for fold in folds:
        geometry_memory = build_geometry_reference_memory(
            fold.training,
            geometry_features,
        )
        facenet_memory = build_reference_memory(fold.training, facenet_features)
        for sample in fold.validation:
            geometry_scores = geometry_relative_scores(
                geometry_features[sample.image_path],
                sample.analysis_group,
                geometry_memory,
                temperature=settings.geometry_temperature,
            )
            facenet_scores = face_type_relative_scores(
                facenet_features[sample.image_path],
                sample.analysis_group,
                facenet_memory,
                top_k=4,
                temperature=settings.facenet_temperature,
            )
            hybrid_scores, used_tie_break = geometry_first_scores(
                geometry_scores,
                facenet_scores,
                tie_margin=settings.geometry_tie_margin,
                geometry_weight=settings.geometry_weight,
            )
            tie_break_count += int(used_tie_break)
            geometry_records.append(_record(sample, geometry_scores))
            hybrid_records.append(_record(sample, hybrid_scores))
            facenet_records.append(_record(sample, facenet_scores))
            shortlist_scores, shortlist_used = facenet_shortlist_geometry_scores(
                geometry_scores,
                facenet_scores,
                tie_margin=settings.geometry_tie_margin,
                geometry_weight=settings.geometry_weight,
            )
            shortlist_tie_break_count += int(shortlist_used)
            shortlist_records.append(_record(sample, shortlist_scores))
            score_pairs.append(
                (
                    sample,
                    tuple(float(value) for value in geometry_scores),
                    tuple(float(value) for value in facenet_scores),
                )
            )

    geometry_metrics = evaluate_predictions(geometry_records, policy)
    hybrid_metrics = evaluate_predictions(hybrid_records, policy)
    facenet_metrics = evaluate_predictions(facenet_records, policy)
    shortlist_metrics = evaluate_predictions(shortlist_records, policy)
    sweep: list[dict[str, Any]] = []
    for tie_margin in (0.01, 0.02, 0.03, 0.05, 0.08, 0.12):
        for geometry_weight in (0.50, 0.60, 0.70, 0.80, 0.90):
            candidate_records: list[PredictionRecord] = []
            used_count = 0
            for sample, geometry_values, facenet_values in score_pairs:
                scores, used = geometry_first_scores(
                    geometry_values,
                    facenet_values,
                    tie_margin=tie_margin,
                    geometry_weight=geometry_weight,
                )
                used_count += int(used)
                candidate_records.append(_record(sample, scores))
            metrics = evaluate_predictions(candidate_records, policy)
            sweep.append(
                {
                    "geometryTieMargin": tie_margin,
                    "geometryWeight": geometry_weight,
                    "top1HitRate": metrics["top1HitRate"],
                    "top2HitRate": metrics["top2HitRate"],
                    "macroF1": metrics["macroF1"],
                    "tieBreakRatio": round(used_count / len(samples), 6),
                }
            )
    best_sweep = max(
        sweep,
        key=lambda row: (
            row["top1HitRate"],
            row["macroF1"],
            row["top2HitRate"],
        ),
    )
    shortlist_sweep: list[dict[str, Any]] = []
    for tie_margin in (0.01, 0.02, 0.03, 0.05, 0.08, 0.12):
        for geometry_weight in (0.50, 0.60, 0.70, 0.80, 0.90):
            candidate_records = []
            used_count = 0
            for sample, geometry_values, facenet_values in score_pairs:
                scores, used = facenet_shortlist_geometry_scores(
                    geometry_values,
                    facenet_values,
                    tie_margin=tie_margin,
                    geometry_weight=geometry_weight,
                )
                used_count += int(used)
                candidate_records.append(_record(sample, scores))
            metrics = evaluate_predictions(candidate_records, policy)
            shortlist_sweep.append(
                {
                    "facenetTieMargin": tie_margin,
                    "geometryWeight": geometry_weight,
                    "top1HitRate": metrics["top1HitRate"],
                    "top2HitRate": metrics["top2HitRate"],
                    "macroF1": metrics["macroF1"],
                    "tieBreakRatio": round(used_count / len(samples), 6),
                    "groups": {
                        group: {
                            "top1HitRate": metrics["groups"][group]["top1HitRate"],
                            "top2HitRate": metrics["groups"][group]["top2HitRate"],
                            "macroF1": metrics["groups"][group]["macroF1"],
                        }
                        for group in ("female", "male")
                    },
                }
            )
    best_shortlist = max(
        shortlist_sweep,
        key=lambda row: (
            row["top1HitRate"],
            row["macroF1"],
            row["top2HitRate"],
        ),
    )
    safe_shortlist_candidates = [
        row
        for row in shortlist_sweep
        if all(
            row["groups"][group]["top1HitRate"]
            >= facenet_metrics["groups"][group]["top1HitRate"]
            and row["groups"][group]["macroF1"]
            >= facenet_metrics["groups"][group]["macroF1"]
            for group in ("female", "male")
        )
    ]
    recommended_shortlist = (
        max(
            safe_shortlist_candidates,
            key=lambda row: (
                row["macroF1"],
                row["top1HitRate"],
                row["top2HitRate"],
                -abs(row["geometryWeight"] - 0.80),
            ),
        )
        if safe_shortlist_candidates
        else None
    )
    ranking_keys = ("top1HitRate", "top2HitRate", "macroF1")
    del geometry_features, facenet_features
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "evaluationType": "person-disjoint-grouped-4-fold",
        "model": "mediapipe-geometry-first-facenet512-tie-break",
        "dataset": {
            "eligibleImages": len(samples),
            "uniquePeople": len({sample.person_id for sample in samples}),
            "weakLabels": True,
        },
        "configuration": asdict(settings),
        "geometryOnly": geometry_metrics,
        "geometryFirstHybrid": hybrid_metrics,
        "facenetBaseline": facenet_metrics,
        "facenetShortlistGeometry": shortlist_metrics,
        "comparison": {
            key: {
                "facenet": facenet_metrics[key],
                "geometryOnly": geometry_metrics[key],
                "hybrid": hybrid_metrics[key],
                "hybridDeltaFromFacenet": round(
                    float(hybrid_metrics[key]) - float(facenet_metrics[key]),
                    6,
                ),
            }
            for key in ranking_keys
        },
        "tieBreakUsage": {
            "count": tie_break_count,
            "ratio": round(tie_break_count / len(samples), 6),
        },
        "facenetShortlistTieBreakUsage": {
            "count": shortlist_tie_break_count,
            "ratio": round(shortlist_tie_break_count / len(samples), 6),
        },
        "parameterSweep": {
            "selectionRule": "top1, then macroF1, then top2; exploratory OOF only",
            "best": best_sweep,
            "candidates": sweep,
        },
        "facenetShortlistSweep": {
            "selectionRule": (
                "preserve FaceNet top2; select top1, then macroF1; exploratory OOF only"
            ),
            "best": best_shortlist,
            "recommendedNoGroupRegression": recommended_shortlist,
            "candidates": shortlist_sweep,
        },
        "privacy": {
            "landmarkLifetime": "request-or-startup-memory-only",
            "persistedLandmarks": False,
            "persistedGeometryFeatures": False,
            "persistedEmbeddings": False,
            "containsIndividualIdentifiers": False,
        },
        "limitations": [
            "Celebrity reference categories are weak entertainment labels.",
            "The upper-face measure uses face-oval top, not a true hairline.",
            "MediaPipe geometry can still vary with pose and landmark quality.",
            "Webcam domain performance is not measured by this dataset.",
            "This report does not establish objective face-type truth.",
        ],
    }


def write_hybrid_report(report: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
