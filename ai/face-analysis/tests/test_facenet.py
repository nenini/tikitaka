from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from face_analysis.facenet import (
    GROUP_CENTERED_CLASS_CENTROID,
    PERSON_SIMILARITY_MEAN,
    FaceNetSimilarityPredictor,
    ReferenceSample,
    build_reference_memory,
    face_type_relative_scores,
)
from face_analysis.labels import ANALYSIS_GROUP_LABELS
from face_analysis.settings import ServiceSettings


class FakeEmbedder:
    def __init__(self, vector: np.ndarray) -> None:
        self.vector = vector

    def embed_bgr_batch(self, images):
        return np.stack([self.vector for _image in images])


def complete_reference_fixture():
    samples: list[ReferenceSample] = []
    features: dict[Path, np.ndarray] = {}
    dimension = 20
    cursor = 0
    for group, labels in ANALYSIS_GROUP_LABELS.items():
        for target, face_type in enumerate(labels):
            for person_index in range(2):
                person = f"{group}-{face_type}-{person_index}"
                image_count = 2 if person_index == 0 else 1
                for image_index in range(image_count):
                    path = Path(f"{person}-{image_index}.jpg")
                    samples.append(
                        ReferenceSample(path, person, group, face_type, target)
                    )
                    vector = np.zeros(dimension, dtype=np.float32)
                    vector[cursor % dimension] = 1.0
                    features[path] = vector
                cursor += 1
    return samples, features


def test_reference_memory_has_one_equal_weight_centroid_per_person() -> None:
    samples, features = complete_reference_fixture()
    memory = build_reference_memory(samples, features)
    assert memory.vectors.shape[0] == 34
    assert len(memory.analysis_groups) == 34
    assert np.allclose(np.linalg.norm(memory.vectors, axis=1), 1.0)
    assert not hasattr(memory, "person_ids")


def test_legacy_face_type_scores_use_top_k_references_and_sum_to_one() -> None:
    samples, features = complete_reference_fixture()
    memory = build_reference_memory(samples, features)
    query = memory.vectors[0]
    scores = face_type_relative_scores(
        query,
        "female",
        memory,
        top_k=1,
        scoring_method=PERSON_SIMILARITY_MEAN,
    )
    assert scores.shape == (9,)
    assert np.isclose(scores.sum(), 1.0)
    assert int(np.argmax(scores)) == ANALYSIS_GROUP_LABELS["female"].index("cat")


def test_group_centered_scores_rank_the_matching_class_and_sum_to_one() -> None:
    samples, features = complete_reference_fixture()
    memory = build_reference_memory(samples, features)
    query = memory.vectors[0]
    expected_face_type = memory.face_types[0]
    scores = face_type_relative_scores(
        query,
        memory.analysis_groups[0],
        memory,
        scoring_method=GROUP_CENTERED_CLASS_CENTROID,
    )
    assert scores.shape == (9,)
    assert np.isclose(scores.sum(), 1.0)
    assert (
        int(np.argmax(scores))
        == ANALYSIS_GROUP_LABELS["female"].index(expected_face_type)
    )


def test_unknown_scoring_method_is_rejected() -> None:
    samples, features = complete_reference_fixture()
    memory = build_reference_memory(samples, features)
    with pytest.raises(ValueError, match="Unsupported similarity scoring method"):
        face_type_relative_scores(
            memory.vectors[0],
            "female",
            memory,
            scoring_method="unknown",  # type: ignore[arg-type]
        )


def test_service_defaults_to_group_centered_v2_scoring() -> None:
    settings = ServiceSettings()
    assert settings.model_version == "face-type-facenet-geometry-v3-experimental"
    assert settings.similarity_scoring_method == GROUP_CENTERED_CLASS_CENTROID
    assert settings.similarity_temperature == 0.20
    assert settings.geometry_tie_margin == 0.02
    assert settings.geometry_weight == 0.80
    with pytest.raises(ValueError, match="similarity_scoring_method"):
        ServiceSettings(similarity_scoring_method="unknown")  # type: ignore[arg-type]


def test_predictor_returns_at_least_one_tag_without_exposing_references() -> None:
    samples, features = complete_reference_fixture()
    memory = build_reference_memory(samples, features)
    predictor = FaceNetSimilarityPredictor(
        FakeEmbedder(memory.vectors[0]),
        memory,
        top_k=1,
    )
    assert predictor.scoring_method == GROUP_CENTERED_CLASS_CENTROID
    result = predictor.predict_aligned_bgr(
        np.zeros((224, 224, 3), dtype=np.uint8),
        "female",
    )
    assert len(result.suggestions) >= 1
    serialized = str(result.as_dict()).lower()
    for forbidden in ("person", "celebrity", "embedding", "landmark", "crop"):
        assert forbidden not in serialized
