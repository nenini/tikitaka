"""Memory-only FaceNet512 similarity scoring for entertainment face types."""

from __future__ import annotations

import csv
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol, Sequence

import cv2
import numpy as np

from .inference import AnalysisResult, PredictionPolicy, result_from_probabilities
from .labels import ANALYSIS_GROUP_LABELS, labels_for_group, normalize_analysis_group


FACENET_MODEL_NAME = "Facenet512"
PERSON_SIMILARITY_MEAN = "person_similarity_mean"
GROUP_CENTERED_CLASS_CENTROID = "group_centered_class_centroid"
SimilarityScoringMethod = Literal[
    "person_similarity_mean",
    "group_centered_class_centroid",
]
SIMILARITY_SCORING_METHODS = {
    PERSON_SIMILARITY_MEAN,
    GROUP_CENTERED_CLASS_CENTROID,
}


def l2_normalize(values: np.ndarray, axis: int = -1) -> np.ndarray:
    array = np.asarray(values, dtype=np.float32)
    norm = np.linalg.norm(array, axis=axis, keepdims=True)
    if np.any(norm <= 1e-12):
        raise ValueError("A zero-length face feature cannot be normalized.")
    return array / norm


@dataclass(frozen=True)
class ReferenceSample:
    image_path: Path
    person_id: str
    analysis_group: str
    face_type: str
    target: int


@dataclass(frozen=True)
class ReferenceMemory:
    """Process-local reference centroids without identity metadata."""

    vectors: np.ndarray
    analysis_groups: tuple[str, ...]
    face_types: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.vectors.ndim != 2 or self.vectors.shape[0] == 0:
            raise ValueError("Reference vectors must be a non-empty matrix.")
        if not (
            self.vectors.shape[0]
            == len(self.analysis_groups)
            == len(self.face_types)
        ):
            raise ValueError("Reference vector metadata is inconsistent.")


class FaceEmbedder(Protocol):
    def embed_bgr_batch(self, images: Sequence[np.ndarray]) -> np.ndarray: ...


class FaceNet512Embedder:
    """Load DeepFace FaceNet512 once and return transient normalized features."""

    def __init__(self, home: Path) -> None:
        home.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("DEEPFACE_HOME", str(home.resolve()))
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(errors="replace")
        from deepface import DeepFace

        self._deepface = DeepFace
        # DeepFace keeps this client in its process-local singleton cache.
        self._deepface.build_model(FACENET_MODEL_NAME)

    def embed_bgr_batch(self, images: Sequence[np.ndarray]) -> np.ndarray:
        if not images:
            raise ValueError("At least one face image is required.")
        validated: list[np.ndarray] = []
        for image in images:
            if (
                image is None
                or image.ndim != 3
                or image.shape[2] != 3
                or image.size == 0
            ):
                raise ValueError("Each FaceNet input must be one non-empty BGR image.")
            validated.append(image)
        raw: Any = self._deepface.represent(
            img_path=validated,
            model_name=FACENET_MODEL_NAME,
            detector_backend="skip",
            enforce_detection=False,
            align=False,
            normalization="base",
            max_faces=1,
        )
        if len(validated) == 1:
            rows = [raw[0]]
        else:
            rows = [result[0] for result in raw]
        vectors = np.asarray([row["embedding"] for row in rows], dtype=np.float32)
        if vectors.shape != (len(validated), 512) or not np.isfinite(vectors).all():
            raise RuntimeError("FaceNet512 returned an invalid feature matrix.")
        return l2_normalize(vectors)


def load_reference_samples(
    data_root: Path,
    report_path: Path,
) -> list[ReferenceSample]:
    resolved_root = data_root.resolve()
    samples: list[ReferenceSample] = []
    with report_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if str(row.get("training_eligible", "")).strip().lower() != "true":
                continue
            relative_path = Path(str(row.get("processed_path", "")))
            image_path = (resolved_root / relative_path).resolve()
            if not image_path.is_relative_to(resolved_root):
                raise ValueError("A reference image path escapes data_root.")
            if not image_path.is_file():
                raise FileNotFoundError("A processed reference image is missing.")
            group = normalize_analysis_group(str(row["analysis_group"]))
            face_type = str(row["face_type"])
            samples.append(
                ReferenceSample(
                    image_path=image_path,
                    person_id=str(row["person_id"]),
                    analysis_group=group,
                    face_type=face_type,
                    target=labels_for_group(group).index(face_type),
                )
            )
    if not samples:
        raise ValueError("No eligible reference images were found.")
    return samples


def read_reference_bgr(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("A processed reference image could not be decoded.")
    return image


def extract_reference_features(
    embedder: FaceEmbedder,
    samples: Sequence[ReferenceSample],
    batch_size: int,
) -> dict[Path, np.ndarray]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive.")
    features: dict[Path, np.ndarray] = {}
    for start in range(0, len(samples), batch_size):
        batch = samples[start : start + batch_size]
        vectors = embedder.embed_bgr_batch(
            [read_reference_bgr(sample.image_path) for sample in batch]
        )
        for sample, vector in zip(batch, vectors, strict=True):
            if sample.image_path in features:
                raise ValueError("Duplicate processed reference image path found.")
            features[sample.image_path] = vector
    return features


def build_reference_memory(
    samples: Sequence[ReferenceSample],
    features: dict[Path, np.ndarray],
) -> ReferenceMemory:
    """Average photos per person, then discard all identity metadata."""
    person_rows: dict[tuple[str, str, str], list[np.ndarray]] = {}
    person_bucket: dict[str, tuple[str, str]] = {}
    for sample in samples:
        bucket = (sample.analysis_group, sample.face_type)
        previous = person_bucket.setdefault(sample.person_id, bucket)
        if previous != bucket:
            raise ValueError("One reference person cannot belong to multiple buckets.")
        try:
            vector = features[sample.image_path]
        except KeyError as exc:
            raise ValueError("A reference image feature is missing.") from exc
        person_rows.setdefault((*bucket, sample.person_id), []).append(vector)

    vectors: list[np.ndarray] = []
    groups: list[str] = []
    face_types: list[str] = []
    for (group, face_type, _person_id), rows in sorted(person_rows.items()):
        vectors.append(l2_normalize(np.mean(rows, axis=0)))
        groups.append(group)
        face_types.append(face_type)

    memory = ReferenceMemory(
        vectors=l2_normalize(np.stack(vectors)),
        analysis_groups=tuple(groups),
        face_types=tuple(face_types),
    )
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        present = {
            face_type
            for row_group, face_type in zip(
                memory.analysis_groups,
                memory.face_types,
                strict=True,
            )
            if row_group == group
        }
        if present != set(labels):
            raise ValueError(f"Reference memory does not cover every {group} face type.")
    return memory


def face_type_relative_scores(
    query_feature: np.ndarray,
    analysis_group: str,
    references: ReferenceMemory,
    *,
    top_k: int = 2,
    temperature: float = 0.20,
    scoring_method: SimilarityScoringMethod = GROUP_CENTERED_CLASS_CENTROID,
) -> np.ndarray:
    group = normalize_analysis_group(analysis_group)
    if top_k < 1 or temperature <= 0:
        raise ValueError("top_k and temperature must be positive.")
    if scoring_method not in SIMILARITY_SCORING_METHODS:
        raise ValueError(f"Unsupported similarity scoring method: {scoring_method}")
    query = l2_normalize(np.asarray(query_feature, dtype=np.float32).reshape(-1))
    if references.vectors.shape[1] != query.shape[0]:
        raise ValueError("Query and reference feature dimensions do not match.")
    group_mask = np.asarray(
        [row_group == group for row_group in references.analysis_groups],
        dtype=bool,
    )
    group_vectors = references.vectors[group_mask]
    group_types = np.asarray(references.face_types)[group_mask]
    labels = ANALYSIS_GROUP_LABELS[group]

    if scoring_method == PERSON_SIMILARITY_MEAN:
        similarities = group_vectors @ query
        class_scores = []
        for face_type in labels:
            candidates = similarities[group_types == face_type]
            if candidates.size == 0:
                raise ValueError(f"No references found for {group}/{face_type}.")
            count = min(top_k, candidates.size)
            class_scores.append(float(np.sort(candidates)[-count:].mean()))
    else:
        class_rows = [group_vectors[group_types == face_type] for face_type in labels]
        if any(rows.size == 0 for rows in class_rows):
            raise ValueError(f"Reference memory does not cover every {group} face type.")
        # Remove the reference group's shared identity-space direction before
        # comparing class shape. Every class contributes one equal-weight mean,
        # so future differences in reference-person counts cannot bias the center.
        group_center = np.mean(
            np.stack([np.mean(rows, axis=0) for rows in class_rows]),
            axis=0,
        )
        centered_query = l2_normalize(query - group_center)
        class_scores = []
        for rows in class_rows:
            centered_people = l2_normalize(rows - group_center, axis=1)
            class_centroid = l2_normalize(np.mean(centered_people, axis=0))
            class_scores.append(float(class_centroid @ centered_query))

    logits = np.asarray(class_scores, dtype=np.float64) / temperature
    logits -= logits.max()
    weights = np.exp(logits)
    return (weights / weights.sum()).astype(np.float32)


class FaceNetSimilarityPredictor:
    """Long-lived no-training predictor using process-local references."""

    def __init__(
        self,
        embedder: FaceEmbedder,
        references: ReferenceMemory,
        policy: PredictionPolicy | None = None,
        *,
        top_k: int = 2,
        temperature: float = 0.20,
        scoring_method: SimilarityScoringMethod = GROUP_CENTERED_CLASS_CENTROID,
    ) -> None:
        if scoring_method not in SIMILARITY_SCORING_METHODS:
            raise ValueError(f"Unsupported similarity scoring method: {scoring_method}")
        self.embedder = embedder
        self.references = references
        self.policy = policy or PredictionPolicy()
        self.top_k = top_k
        self.temperature = temperature
        self.scoring_method = scoring_method

    def predict_aligned_bgr(
        self,
        aligned_face: np.ndarray,
        analysis_group: str,
    ) -> AnalysisResult:
        query = self.embedder.embed_bgr_batch([aligned_face])[0]
        scores = face_type_relative_scores(
            query,
            analysis_group,
            self.references,
            top_k=self.top_k,
            temperature=self.temperature,
            scoring_method=self.scoring_method,
        )
        return result_from_probabilities(scores, analysis_group, self.policy)
