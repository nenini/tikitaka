from __future__ import annotations

import numpy as np

from face_analysis.preprocessing import align_face, quality_issues


def test_alignment_reflect_pads_without_mutating_source() -> None:
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[:, :, 1] = np.arange(100, dtype=np.uint8)[:, None]
    original = image.copy()
    # x, y, w, h, then five landmarks and detector confidence.
    detection = np.asarray(
        [0, 0, 60, 70, 12, 22, 42, 20, 27, 38, 15, 55, 40, 53, 0.99],
        dtype=np.float32,
    )
    aligned, quality = align_face(image, detection, output_size=224)
    assert aligned.shape == (224, 224, 3)
    assert np.array_equal(image, original)
    assert quality.face_confidence == 0.99


def test_quality_issues_are_scalar_flags_only() -> None:
    image = np.full((120, 120, 3), 127, dtype=np.uint8)
    detection = np.asarray(
        [20, 15, 70, 80, 38, 45, 72, 45, 55, 63, 42, 82, 69, 82, 0.95],
        dtype=np.float32,
    )
    _, quality = align_face(image, detection)
    assert isinstance(quality_issues(quality), tuple)
    assert set(quality.as_dict()) == {
        "face_confidence",
        "face_ratio",
        "brightness_score",
        "blur_score",
        "roll_degrees",
    }
