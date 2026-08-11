from __future__ import annotations

import numpy as np

from face_analysis.hybrid import (
    facenet_shortlist_geometry_scores,
    geometry_first_scores,
)


def test_clear_geometry_result_does_not_use_facenet() -> None:
    geometry = np.asarray([0.60, 0.20, 0.10, 0.10], dtype=np.float32)
    scores, used_tie_break = geometry_first_scores(
        geometry,
        np.asarray([0.05, 0.85, 0.05, 0.05], dtype=np.float32),
        tie_margin=0.08,
    )
    assert not used_tie_break
    assert np.allclose(scores, geometry)


def test_facenet_only_breaks_an_ambiguous_geometry_ranking() -> None:
    geometry = np.asarray([0.31, 0.30, 0.20, 0.19], dtype=np.float32)
    facenet = np.asarray([0.05, 0.85, 0.05, 0.05], dtype=np.float32)
    scores, used_tie_break = geometry_first_scores(
        geometry,
        facenet,
        tie_margin=0.08,
        geometry_weight=0.80,
    )
    assert used_tie_break
    assert int(np.argmax(scores)) == 1
    assert np.isclose(scores.sum(), 1.0)


def test_geometry_reranks_but_preserves_facenet_top_two() -> None:
    geometry = np.asarray([0.80, 0.05, 0.10, 0.05], dtype=np.float32)
    facenet = np.asarray([0.29, 0.30, 0.25, 0.16], dtype=np.float32)
    scores, used_tie_break = facenet_shortlist_geometry_scores(
        geometry,
        facenet,
        tie_margin=0.08,
        geometry_weight=0.80,
    )
    assert used_tie_break
    assert list(np.argsort(scores)[-2:][::-1]) == [0, 1]
    assert np.isclose(scores.sum(), 1.0)
