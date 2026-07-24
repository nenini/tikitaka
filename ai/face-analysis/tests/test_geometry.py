from __future__ import annotations

from pathlib import Path

import numpy as np

from face_analysis.facenet import ReferenceSample
from face_analysis.geometry import (
    GEOMETRY_FEATURE_NAMES,
    GEOMETRY_FEATURE_WEIGHTS,
    build_geometry_reference_memory,
    geometry_features_from_landmarks,
    geometry_relative_scores,
)
from face_analysis.labels import ANALYSIS_GROUP_LABELS


def synthetic_landmarks() -> np.ndarray:
    points = np.zeros((478, 3), dtype=np.float32)
    coordinates = {
        10: (0.50, 0.10),
        152: (0.50, 0.90),
        127: (0.20, 0.32),
        356: (0.80, 0.32),
        234: (0.15, 0.52),
        454: (0.85, 0.52),
        172: (0.25, 0.75),
        397: (0.75, 0.75),
        105: (0.38, 0.30),
        334: (0.62, 0.30),
        2: (0.50, 0.65),
        168: (0.50, 0.40),
        33: (0.28, 0.45),
        133: (0.42, 0.47),
        159: (0.35, 0.44),
        145: (0.35, 0.50),
        362: (0.58, 0.47),
        263: (0.72, 0.45),
        386: (0.65, 0.44),
        374: (0.65, 0.50),
        98: (0.43, 0.62),
        327: (0.57, 0.62),
    }
    for index, (x, y) in coordinates.items():
        points[index, :2] = (x, y)
    return points


def complete_geometry_fixture():
    samples: list[ReferenceSample] = []
    features: dict[Path, np.ndarray] = {}
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        for target, face_type in enumerate(labels):
            for person_index in range(2):
                path = Path(f"{group}-{face_type}-{person_index}.jpg")
                person_id = f"{group}-{face_type}-{person_index}"
                samples.append(
                    ReferenceSample(
                        path,
                        person_id,
                        group,
                        face_type,
                        target,
                    )
                )
                row = np.full(len(GEOMETRY_FEATURE_NAMES), 0.5, dtype=np.float32)
                row[target % len(row)] += 0.1 + person_index * 0.002
                features[path] = row
    return samples, features


def test_geometry_features_are_dimensionless_and_mirror_stable() -> None:
    landmarks = synthetic_landmarks()
    original = geometry_features_from_landmarks(landmarks)
    mirrored = landmarks.copy()
    mirrored[:, 0] = 1.0 - mirrored[:, 0]
    mirrored_features = geometry_features_from_landmarks(mirrored)
    assert original.shape == (15,)
    assert np.allclose(original, mirrored_features, atol=1e-6)
    assert np.isclose(GEOMETRY_FEATURE_WEIGHTS.sum(), 1.0)


def test_geometry_memory_is_aggregate_only_and_ranks_matching_class() -> None:
    samples, features = complete_geometry_fixture()
    memory = build_geometry_reference_memory(samples, features)
    query_sample = samples[0]
    scores = geometry_relative_scores(
        features[query_sample.image_path],
        query_sample.analysis_group,
        memory,
    )
    assert scores.shape == (9,)
    assert np.isclose(scores.sum(), 1.0)
    assert int(np.argmax(scores)) == query_sample.target
    assert not hasattr(memory, "person_ids")
    assert not hasattr(memory, "landmarks")
