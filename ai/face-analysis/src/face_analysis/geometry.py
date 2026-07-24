"""Transient MediaPipe geometry features for entertainment face-type scoring."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Sequence

import cv2
import numpy as np

from .facenet import ReferenceSample, read_reference_bgr
from .labels import ANALYSIS_GROUP_LABELS, normalize_analysis_group


GEOMETRY_FEATURE_NAMES = (
    "face_width_height",
    "cheek_width_height",
    "jaw_width_height",
    "jaw_cheek_ratio",
    "upper_face_ratio",
    "middle_face_ratio",
    "lower_face_ratio",
    "eye_width_face_ratio",
    "eye_height_face_ratio",
    "inter_eye_face_ratio",
    "eye_aspect_ratio",
    "outer_eye_tilt",
    "nose_length_face_ratio",
    "nose_width_face_ratio",
    "nose_width_length_ratio",
)

# Category totals: face shape 30%, vertical thirds 25%, eye size/spacing 15%,
# eye-corner tilt 10%, and nose length/width 20%.
GEOMETRY_FEATURE_WEIGHTS = np.asarray(
    [
        0.075,
        0.075,
        0.075,
        0.075,
        0.25 / 3,
        0.25 / 3,
        0.25 / 3,
        0.15 / 4,
        0.15 / 4,
        0.15 / 4,
        0.15 / 4,
        0.10,
        0.20 / 3,
        0.20 / 3,
        0.20 / 3,
    ],
    dtype=np.float32,
)

_GROUP_ORDER = tuple(ANALYSIS_GROUP_LABELS)
_MIN_ROBUST_SCALE = 0.01
_MAX_STANDARDIZED_MAGNITUDE = 5.0


class GeometryExtractionError(ValueError):
    """Raised without retaining or exposing a full landmark array."""


class GeometryExtractor(Protocol):
    def extract_bgr_batch(self, images: Sequence[np.ndarray]) -> np.ndarray: ...


def _distance(points: np.ndarray, first: int, second: int) -> float:
    return float(np.linalg.norm(points[first, :2] - points[second, :2]))


def _midpoint(points: np.ndarray, first: int, second: int) -> np.ndarray:
    return (points[first, :2] + points[second, :2]) / 2.0


def geometry_features_from_landmarks(landmarks: np.ndarray) -> np.ndarray:
    """Reduce one transient landmark array to symmetric dimensionless ratios."""
    points = np.asarray(landmarks, dtype=np.float32)
    if (
        points.ndim != 2
        or points.shape[0] < 468
        or points.shape[1] < 2
        or not np.isfinite(points).all()
    ):
        raise GeometryExtractionError("Face landmarks are incomplete.")

    face_height = _distance(points, 10, 152)
    face_width = _distance(points, 127, 356)
    cheek_width = _distance(points, 234, 454)
    jaw_width = _distance(points, 172, 397)
    if min(face_height, face_width, cheek_width, jaw_width) <= 1e-6:
        raise GeometryExtractionError("Face geometry is degenerate.")

    brow_center = _midpoint(points, 105, 334)
    nose_base = points[2, :2]
    face_top = points[10, :2]
    chin = points[152, :2]
    # The top-of-face landmark is a stable upper-face approximation. It is not
    # presented as a true hairline or anatomical forehead measurement.
    upper_height = float(np.linalg.norm(brow_center - face_top))
    middle_height = float(np.linalg.norm(nose_base - brow_center))
    lower_height = float(np.linalg.norm(chin - nose_base))

    right_eye_width = _distance(points, 33, 133)
    left_eye_width = _distance(points, 362, 263)
    right_eye_height = _distance(points, 159, 145)
    left_eye_height = _distance(points, 386, 374)
    mean_eye_width = (right_eye_width + left_eye_width) / 2.0
    mean_eye_height = (right_eye_height + left_eye_height) / 2.0
    inter_eye = _distance(points, 133, 362)
    if mean_eye_width <= 1e-6:
        raise GeometryExtractionError("Eye geometry is degenerate.")

    # Positive values mean that the outer corners sit higher in image space.
    right_tilt = np.arctan2(
        float(points[133, 1] - points[33, 1]),
        abs(float(points[133, 0] - points[33, 0])),
    )
    left_tilt = np.arctan2(
        float(points[362, 1] - points[263, 1]),
        abs(float(points[362, 0] - points[263, 0])),
    )
    outer_eye_tilt = float((right_tilt + left_tilt) / 2.0)

    nose_length = _distance(points, 168, 2)
    nose_width = _distance(points, 98, 327)
    if nose_length <= 1e-6:
        raise GeometryExtractionError("Nose geometry is degenerate.")

    features = np.asarray(
        [
            face_width / face_height,
            cheek_width / face_height,
            jaw_width / face_height,
            jaw_width / cheek_width,
            upper_height / face_height,
            middle_height / face_height,
            lower_height / face_height,
            mean_eye_width / cheek_width,
            mean_eye_height / face_height,
            inter_eye / cheek_width,
            mean_eye_height / mean_eye_width,
            outer_eye_tilt,
            nose_length / face_height,
            nose_width / cheek_width,
            nose_width / nose_length,
        ],
        dtype=np.float32,
    )
    if (
        features.shape != (len(GEOMETRY_FEATURE_NAMES),)
        or not np.isfinite(features).all()
        or np.any(features <= -1.0)
        or np.any(features >= 3.0)
    ):
        raise GeometryExtractionError("Face geometry is outside supported bounds.")
    return features


class MediaPipeGeometryExtractor:
    """Load Face Landmarker once and never retain its per-image landmark output."""

    def __init__(
        self,
        model_path: Path,
        *,
        min_detection_confidence: float = 0.5,
        min_presence_confidence: float = 0.5,
    ) -> None:
        if not model_path.is_file():
            raise FileNotFoundError("MediaPipe Face Landmarker model is missing.")
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        import mediapipe as mp

        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(
                # The native Windows runtime cannot reliably open model paths
                # containing non-ASCII characters. Load the ignored local asset
                # once into the task instead of copying it to a different path.
                model_asset_buffer=model_path.read_bytes(),
            ),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=min_detection_confidence,
            min_face_presence_confidence=min_presence_confidence,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self._mp = mp
        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def extract_bgr_batch(self, images: Sequence[np.ndarray]) -> np.ndarray:
        if not images:
            raise ValueError("At least one face image is required.")
        rows: list[np.ndarray] = []
        for image in images:
            if (
                image is None
                or image.ndim != 3
                or image.shape[2] != 3
                or image.size == 0
            ):
                raise ValueError("Each geometry input must be one non-empty BGR image.")
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            media_image = self._mp.Image(
                image_format=self._mp.ImageFormat.SRGB,
                data=np.ascontiguousarray(rgb),
            )
            result = self._landmarker.detect(media_image)
            if len(result.face_landmarks) != 1:
                raise GeometryExtractionError("One face landmark set was not found.")
            transient_landmarks = np.asarray(
                [
                    (landmark.x, landmark.y, landmark.z)
                    for landmark in result.face_landmarks[0]
                ],
                dtype=np.float32,
            )
            rows.append(geometry_features_from_landmarks(transient_landmarks))
            del transient_landmarks, result, media_image, rgb
        matrix = np.stack(rows)
        if not np.isfinite(matrix).all():
            raise GeometryExtractionError("Geometry extraction returned invalid data.")
        return matrix

    def close(self) -> None:
        self._landmarker.close()


@dataclass(frozen=True)
class GeometryReferenceMemory:
    """Aggregate-only geometry state with no person or image identifiers."""

    prototypes: np.ndarray
    prototype_groups: tuple[str, ...]
    prototype_face_types: tuple[str, ...]
    group_medians: np.ndarray
    group_scales: np.ndarray

    def __post_init__(self) -> None:
        feature_count = len(GEOMETRY_FEATURE_NAMES)
        if self.prototypes.shape != (
            len(self.prototype_groups),
            feature_count,
        ):
            raise ValueError("Geometry prototype metadata is inconsistent.")
        expected_stats = (len(_GROUP_ORDER), feature_count)
        if (
            self.group_medians.shape != expected_stats
            or self.group_scales.shape != expected_stats
            or np.any(self.group_scales <= 0)
        ):
            raise ValueError("Geometry normalization statistics are invalid.")


def extract_reference_geometry(
    extractor: GeometryExtractor,
    samples: Sequence[ReferenceSample],
    batch_size: int,
) -> dict[Path, np.ndarray]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive.")
    features: dict[Path, np.ndarray] = {}
    for start in range(0, len(samples), batch_size):
        batch = samples[start : start + batch_size]
        rows = extractor.extract_bgr_batch(
            [read_reference_bgr(sample.image_path) for sample in batch]
        )
        for sample, row in zip(batch, rows, strict=True):
            if sample.image_path in features:
                raise ValueError("Duplicate processed reference image path found.")
            features[sample.image_path] = row
    return features


def build_geometry_reference_memory(
    samples: Sequence[ReferenceSample],
    features: dict[Path, np.ndarray],
) -> GeometryReferenceMemory:
    """Equal-weight photos per person, then discard identity-level geometry."""
    person_rows: dict[tuple[str, str, str], list[np.ndarray]] = {}
    person_bucket: dict[str, tuple[str, str]] = {}
    for sample in samples:
        bucket = (sample.analysis_group, sample.face_type)
        previous = person_bucket.setdefault(sample.person_id, bucket)
        if previous != bucket:
            raise ValueError("One reference person cannot belong to multiple buckets.")
        try:
            row = features[sample.image_path]
        except KeyError as exc:
            raise ValueError("A reference geometry feature is missing.") from exc
        person_rows.setdefault((*bucket, sample.person_id), []).append(row)

    people: list[tuple[str, str, np.ndarray]] = []
    for (group, face_type, _person_id), rows in sorted(person_rows.items()):
        people.append((group, face_type, np.mean(rows, axis=0)))

    medians: list[np.ndarray] = []
    scales: list[np.ndarray] = []
    for group in _GROUP_ORDER:
        group_rows = np.stack([row for row_group, _, row in people if row_group == group])
        median = np.median(group_rows, axis=0)
        mad = np.median(np.abs(group_rows - median), axis=0)
        medians.append(median.astype(np.float32))
        scales.append(
            np.maximum(1.4826 * mad, _MIN_ROBUST_SCALE).astype(np.float32)
        )

    prototypes: list[np.ndarray] = []
    prototype_groups: list[str] = []
    prototype_types: list[str] = []
    median_matrix = np.stack(medians)
    scale_matrix = np.stack(scales)
    for group_index, group in enumerate(_GROUP_ORDER):
        for face_type in ANALYSIS_GROUP_LABELS[group]:
            rows = np.stack(
                [
                    row
                    for row_group, row_type, row in people
                    if row_group == group and row_type == face_type
                ]
            )
            standardized = np.clip(
                (rows - median_matrix[group_index]) / scale_matrix[group_index],
                -_MAX_STANDARDIZED_MAGNITUDE,
                _MAX_STANDARDIZED_MAGNITUDE,
            )
            prototypes.append(np.mean(standardized, axis=0))
            prototype_groups.append(group)
            prototype_types.append(face_type)

    memory = GeometryReferenceMemory(
        prototypes=np.stack(prototypes).astype(np.float32),
        prototype_groups=tuple(prototype_groups),
        prototype_face_types=tuple(prototype_types),
        group_medians=median_matrix,
        group_scales=scale_matrix,
    )
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        present = {
            face_type
            for row_group, face_type in zip(
                memory.prototype_groups,
                memory.prototype_face_types,
                strict=True,
            )
            if row_group == group
        }
        if present != set(labels):
            raise ValueError(f"Geometry memory does not cover every {group} face type.")
    return memory


def geometry_relative_scores(
    query_features: np.ndarray,
    analysis_group: str,
    references: GeometryReferenceMemory,
    *,
    temperature: float = 1.0,
) -> np.ndarray:
    group = normalize_analysis_group(analysis_group)
    if temperature <= 0:
        raise ValueError("temperature must be positive.")
    query = np.asarray(query_features, dtype=np.float32).reshape(-1)
    if query.shape != (len(GEOMETRY_FEATURE_NAMES),) or not np.isfinite(query).all():
        raise ValueError("Query geometry has an invalid shape or value.")
    group_index = _GROUP_ORDER.index(group)
    standardized = np.clip(
        (query - references.group_medians[group_index])
        / references.group_scales[group_index],
        -_MAX_STANDARDIZED_MAGNITUDE,
        _MAX_STANDARDIZED_MAGNITUDE,
    )
    mask = np.asarray(
        [row_group == group for row_group in references.prototype_groups],
        dtype=bool,
    )
    prototypes = references.prototypes[mask]
    types = np.asarray(references.prototype_face_types)[mask]
    labels = ANALYSIS_GROUP_LABELS[group]
    ordered = np.stack([prototypes[types == face_type][0] for face_type in labels])
    distances = np.sum(
        GEOMETRY_FEATURE_WEIGHTS * np.square(ordered - standardized),
        axis=1,
    )
    logits = -distances.astype(np.float64) / temperature
    logits -= logits.max()
    weights = np.exp(logits)
    return (weights / weights.sum()).astype(np.float32)
