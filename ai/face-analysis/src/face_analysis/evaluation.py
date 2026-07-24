"""Person-disjoint cross-validation with aggregate-only reporting."""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader

from .inference import PredictionPolicy
from .labels import ANALYSIS_GROUP_LABELS
from .model import FaceTypeClassifier, load_dinov2_backbone
from .training import (
    ProcessedFaceDataset,
    TrainingSample,
    inference_transform,
    seed_everything,
    train_one_epoch,
)


@dataclass(frozen=True)
class FoldSplit:
    index: int
    training: tuple[TrainingSample, ...]
    validation: tuple[TrainingSample, ...]


@dataclass(frozen=True)
class PredictionRecord:
    analysis_group: str
    target: int
    probabilities: tuple[float, ...]


@dataclass(frozen=True)
class EvaluationConfig:
    epochs: int = 30
    batch_size: int = 16
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    seed: int = 307
    folds: int = 4
    minimum_calibration_coverage: float = 0.2
    target_confirmed_accuracy: float = 0.7


def build_person_disjoint_folds(
    samples: list[TrainingSample],
    fold_count: int = 4,
) -> list[FoldSplit]:
    if fold_count < 2:
        raise ValueError("fold_count must be at least two.")
    people_by_class: dict[tuple[str, str], set[str]] = {}
    person_bucket: dict[str, tuple[str, str]] = {}
    for sample in samples:
        bucket = (sample.analysis_group, sample.face_type)
        previous = person_bucket.setdefault(sample.person_id, bucket)
        if previous != bucket:
            raise ValueError("One person cannot belong to multiple label buckets.")
        people_by_class.setdefault(bucket, set()).add(sample.person_id)

    expected_buckets = {
        (group, face_type)
        for group, labels in ANALYSIS_GROUP_LABELS.items()
        for face_type in labels
    }
    if set(people_by_class) != expected_buckets:
        raise ValueError("The dataset does not cover every group-specific class.")

    person_fold: dict[str, int] = {}
    for bucket, people in sorted(people_by_class.items()):
        if len(people) != fold_count:
            raise ValueError(
                f"{bucket} must contain exactly {fold_count} unique people."
            )
        for fold_index, person_id in enumerate(sorted(people)):
            person_fold[person_id] = fold_index

    folds: list[FoldSplit] = []
    for fold_index in range(fold_count):
        validation = tuple(
            sample for sample in samples if person_fold[sample.person_id] == fold_index
        )
        training = tuple(
            sample for sample in samples if person_fold[sample.person_id] != fold_index
        )
        training_people = {sample.person_id for sample in training}
        validation_people = {sample.person_id for sample in validation}
        if training_people & validation_people:
            raise AssertionError("A person appeared in both training and validation.")
        folds.append(FoldSplit(fold_index, training, validation))
    return folds


def collect_predictions(
    model: FaceTypeClassifier,
    samples: tuple[TrainingSample, ...],
    batch_size: int,
    device: torch.device,
) -> list[PredictionRecord]:
    dataset = ProcessedFaceDataset(list(samples), inference_transform())
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    records: list[PredictionRecord] = []
    model.eval()
    with torch.inference_mode():
        for images, groups, targets in loader:
            images = images.to(device, non_blocking=True)
            for group in sorted(set(groups)):
                positions = [
                    index for index, value in enumerate(groups) if value == group
                ]
                indices = torch.tensor(positions, device=device)
                logits = model(images.index_select(0, indices), group)
                probabilities = torch.softmax(logits, dim=1).cpu()
                for local_index, batch_index in enumerate(positions):
                    records.append(
                        PredictionRecord(
                            analysis_group=group,
                            target=int(targets[batch_index]),
                            probabilities=tuple(
                                float(value) for value in probabilities[local_index]
                            ),
                        )
                    )
    return records


def _confusion_and_class_metrics(
    records: list[PredictionRecord], group: str
) -> dict[str, Any]:
    labels = ANALYSIS_GROUP_LABELS[group]
    matrix = [[0 for _ in labels] for _ in labels]
    selected = [record for record in records if record.analysis_group == group]
    top1_hits = 0
    top2_hits = 0
    for record in selected:
        ranking = sorted(
            range(len(record.probabilities)),
            key=lambda index: record.probabilities[index],
            reverse=True,
        )
        predicted = ranking[0]
        matrix[record.target][predicted] += 1
        top1_hits += int(predicted == record.target)
        top2_hits += int(record.target in ranking[:2])

    class_metrics: dict[str, dict[str, float | int]] = {}
    f1_values: list[float] = []
    for index, label in enumerate(labels):
        true_positive = matrix[index][index]
        false_positive = sum(row[index] for row in matrix) - true_positive
        support = sum(matrix[index])
        precision = true_positive / (true_positive + false_positive) if (
            true_positive + false_positive
        ) else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (
            precision + recall
        ) else 0.0
        f1_values.append(f1)
        class_metrics[label] = {
            "precision": round(precision, 6),
            "recall": round(recall, 6),
            "f1": round(f1, 6),
            "support": support,
        }
    count = len(selected)
    return {
        "sampleCount": count,
        "top1HitRate": round(top1_hits / count, 6) if count else 0.0,
        "top2HitRate": round(top2_hits / count, 6) if count else 0.0,
        "macroF1": round(sum(f1_values) / len(f1_values), 6),
        "labels": list(labels),
        "confusionMatrix": matrix,
        "classes": class_metrics,
    }


def evaluate_predictions(
    records: list[PredictionRecord],
    policy: PredictionPolicy,
) -> dict[str, Any]:
    if not records:
        raise ValueError("At least one prediction is required.")
    top1_hits = 0
    top2_hits = 0
    confirmed = 0
    confirmed_correct = 0
    for record in records:
        ranking = sorted(
            range(len(record.probabilities)),
            key=lambda index: record.probabilities[index],
            reverse=True,
        )
        top1 = ranking[0]
        top1_hits += int(top1 == record.target)
        top2_hits += int(record.target in ranking[:2])
        top_score = record.probabilities[ranking[0]]
        second_score = record.probabilities[ranking[1]]
        is_confirmed = (
            top_score >= policy.success_threshold
            and top_score - second_score >= policy.minimum_margin
        )
        if is_confirmed:
            confirmed += 1
            confirmed_correct += int(top1 == record.target)

    group_metrics = {
        group: _confusion_and_class_metrics(records, group)
        for group in ANALYSIS_GROUP_LABELS
    }
    all_f1 = [
        values["f1"]
        for group in group_metrics.values()
        for values in group["classes"].values()
    ]
    count = len(records)
    coverage = confirmed / count
    wrong_confirmed = confirmed - confirmed_correct
    return {
        "sampleCount": count,
        "top1HitRate": round(top1_hits / count, 6),
        "top2HitRate": round(top2_hits / count, 6),
        "macroF1": round(sum(all_f1) / len(all_f1), 6),
        "coverage": round(coverage, 6),
        "abstentionRatio": round(1.0 - coverage, 6),
        "confirmedAccuracy": (
            round(confirmed_correct / confirmed, 6) if confirmed else None
        ),
        "wrongConfirmedRate": round(wrong_confirmed / count, 6),
        "groups": group_metrics,
    }


def calibrate_abstention_policy(
    records: list[PredictionRecord],
    minimum_coverage: float = 0.2,
    target_accuracy: float = 0.7,
) -> dict[str, Any]:
    if not records:
        raise ValueError("At least one prediction is required.")
    minimum_count = max(1, math.ceil(len(records) * minimum_coverage))
    candidates: list[dict[str, float | int]] = []
    for threshold_step in range(25):
        threshold = 0.2 + threshold_step * 0.025
        for margin_step in range(16):
            margin = margin_step * 0.02
            selected = 0
            correct = 0
            for record in records:
                ranking = sorted(
                    range(len(record.probabilities)),
                    key=lambda index: record.probabilities[index],
                    reverse=True,
                )
                top_score = record.probabilities[ranking[0]]
                second_score = record.probabilities[ranking[1]]
                if top_score >= threshold and top_score - second_score >= margin:
                    selected += 1
                    correct += int(ranking[0] == record.target)
            if selected >= minimum_count:
                candidates.append(
                    {
                        "successThreshold": round(threshold, 3),
                        "minimumMargin": round(margin, 3),
                        "selected": selected,
                        "coverage": selected / len(records),
                        "confirmedAccuracy": correct / selected,
                    }
                )
    if not candidates:
        raise ValueError("No calibration candidate met minimum coverage.")
    target_candidates = [
        candidate
        for candidate in candidates
        if candidate["confirmedAccuracy"] >= target_accuracy
    ]
    if target_candidates:
        chosen = max(
            target_candidates,
            key=lambda item: (item["coverage"], item["confirmedAccuracy"]),
        )
        target_met = True
    else:
        chosen = max(
            candidates,
            key=lambda item: (item["confirmedAccuracy"], item["coverage"]),
        )
        target_met = False
    return {
        "successThreshold": chosen["successThreshold"],
        "minimumMargin": chosen["minimumMargin"],
        "secondSuggestionThreshold": 0.25,
        "coverage": round(float(chosen["coverage"]), 6),
        "confirmedAccuracy": round(float(chosen["confirmedAccuracy"]), 6),
        "targetConfirmedAccuracy": target_accuracy,
        "targetMet": target_met,
        "recommendationAvailable": target_met,
        "minimumCoverage": minimum_coverage,
        "exploratoryOnly": True,
    }


def run_cross_validation(
    samples: list[TrainingSample],
    device: torch.device,
    torch_hub_dir: Path,
    config: EvaluationConfig | None = None,
) -> dict[str, Any]:
    settings = config or EvaluationConfig()
    folds = build_person_disjoint_folds(samples, settings.folds)
    backbone = load_dinov2_backbone(str(torch_hub_dir))
    all_predictions: list[PredictionRecord] = []
    fold_reports: list[dict[str, Any]] = []
    initial_policy = PredictionPolicy()

    for fold in folds:
        seed_everything(settings.seed + fold.index)
        model = FaceTypeClassifier(backbone).to(device)
        dataset = ProcessedFaceDataset(list(fold.training))
        generator = torch.Generator().manual_seed(settings.seed + fold.index)
        loader = DataLoader(
            dataset,
            batch_size=settings.batch_size,
            shuffle=True,
            num_workers=0,
            pin_memory=device.type == "cuda",
            generator=generator,
        )
        optimizer = torch.optim.AdamW(
            model.trainable_parameters(),
            lr=settings.learning_rate,
            weight_decay=settings.weight_decay,
        )
        final_loss = 0.0
        for _epoch in range(settings.epochs):
            final_loss = train_one_epoch(model, loader, optimizer, device)
        predictions = collect_predictions(
            model,
            fold.validation,
            settings.batch_size,
            device,
        )
        all_predictions.extend(predictions)
        fold_metrics = evaluate_predictions(predictions, initial_policy)
        fold_reports.append(
            {
                "fold": fold.index + 1,
                "trainingImages": len(fold.training),
                "validationImages": len(fold.validation),
                "trainingPeople": len(
                    {sample.person_id for sample in fold.training}
                ),
                "validationPeople": len(
                    {sample.person_id for sample in fold.validation}
                ),
                "finalTrainingLoss": round(final_loss, 6),
                "metrics": {
                    key: fold_metrics[key]
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
        del optimizer, model
        if device.type == "cuda":
            torch.cuda.empty_cache()

    initial_metrics = evaluate_predictions(all_predictions, initial_policy)
    calibration = calibrate_abstention_policy(
        all_predictions,
        settings.minimum_calibration_coverage,
        settings.target_confirmed_accuracy,
    )
    calibrated_metrics = None
    if calibration["recommendationAvailable"]:
        calibrated_policy = PredictionPolicy(
            success_threshold=float(calibration["successThreshold"]),
            minimum_margin=float(calibration["minimumMargin"]),
            second_suggestion_threshold=float(
                calibration["secondSuggestionThreshold"]
            ),
        )
        calibrated_metrics = evaluate_predictions(all_predictions, calibrated_policy)
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "evaluationType": "person-disjoint-grouped-4-fold",
        "model": "dinov2_vits14-frozen-dual-head",
        "dataset": {
            "eligibleImages": len(samples),
            "uniquePeople": len({sample.person_id for sample in samples}),
            "weakLabels": True,
        },
        "training": asdict(settings),
        "initialPolicy": asdict(initial_policy),
        "folds": fold_reports,
        "aggregateInitial": initial_metrics,
        "calibration": calibration,
        "aggregateRecommendedPolicy": calibrated_metrics,
        "limitations": [
            "Celebrity reference labels are weak labels, not objective ground truth.",
            "Only four people are available per group-specific class.",
            "Threshold calibration and reporting use the same out-of-fold predictions.",
            "Webcam domain performance is not measured by this dataset.",
            "This report does not establish production readiness.",
        ],
    }


def write_evaluation_reports(
    report: dict[str, Any],
    json_path: Path,
    markdown_path: Path,
) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    initial = report["aggregateInitial"]
    recommended = report["aggregateRecommendedPolicy"]
    calibration = report["calibration"]
    metric_rows = [_metric_row("초기", initial)]
    if recommended is not None:
        metric_rows.append(_metric_row("탐색 추천", recommended))
    lines = [
        "# Person-disjoint 얼굴상 분류 평가",
        "",
        "> 이 결과는 연예인 weak label 데이터의 탐색 평가이며 운영 정확도를 입증하지 않습니다.",
        "",
        "## 평가 설정",
        "",
        f"- 방식: {report['evaluationType']}",
        f"- 모델: {report['model']}",
        f"- 품질 통과 이미지: {report['dataset']['eligibleImages']}",
        f"- 고유 인물: {report['dataset']['uniquePeople']}",
        "- 동일 인물의 학습·검증 중복: 없음",
        "",
        "## 전체 결과",
        "",
        "| 정책 | Top-1 | Top-2 | macro F1 | coverage | abstention | 확정 정확도 | 잘못된 확정률 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
        *metric_rows,
        "",
        "## 임계값 탐색",
        "",
        f"- 최고 탐색 후보 success threshold: {calibration['successThreshold']}",
        f"- 최고 탐색 후보 minimum margin: {calibration['minimumMargin']}",
        f"- 목표 확정 정확도 충족: {calibration['targetMet']}",
        f"- 서비스 적용 가능한 추천 존재: {calibration['recommendationAvailable']}",
        "- 목표 미달 후보는 서비스 임계값으로 추천하거나 적용하지 않음",
        "- 동일 OOF 예측으로 탐색했으므로 목표 충족 시에도 별도 검증 전 자동 적용 금지",
        "",
        "## Fold 결과",
        "",
        "| Fold | 학습 인물 | 검증 인물 | 검증 이미지 | Top-1 | Top-2 | macro F1 |",
        "|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for fold in report["folds"]:
        metrics = fold["metrics"]
        lines.append(
            f"| {fold['fold']} | {fold['trainingPeople']} | "
            f"{fold['validationPeople']} | {fold['validationImages']} | "
            f"{metrics['top1HitRate']:.4f} | {metrics['top2HitRate']:.4f} | "
            f"{metrics['macroF1']:.4f} |"
        )
    for group, values in initial["groups"].items():
        lines.extend(["", f"## {group} 혼동행렬", ""])
        labels = values["labels"]
        lines.append("| actual \\ predicted | " + " | ".join(labels) + " |")
        lines.append("|---|" + "---:|" * len(labels))
        for label, row in zip(labels, values["confusionMatrix"]):
            lines.append(f"| {label} | " + " | ".join(map(str, row)) + " |")
    lines.extend(["", "## 제한사항", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _metric_row(name: str, metrics: dict[str, Any]) -> str:
    confirmed_accuracy = metrics["confirmedAccuracy"]
    confirmed_text = (
        f"{confirmed_accuracy:.4f}" if confirmed_accuracy is not None else "N/A"
    )
    return (
        f"| {name} | {metrics['top1HitRate']:.4f} | "
        f"{metrics['top2HitRate']:.4f} | {metrics['macroF1']:.4f} | "
        f"{metrics['coverage']:.4f} | {metrics['abstentionRatio']:.4f} | "
        f"{confirmed_text} | {metrics['wrongConfirmedRate']:.4f} |"
    )
