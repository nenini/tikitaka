from __future__ import annotations

import numpy as np

from face_analysis.inference import AnalysisResult, AnalysisStatus, Suggestion
from face_analysis.preprocessing import FaceQuality
from face_analysis.service import FaceAnalysisService, PreparedFace
from face_analysis.settings import ServiceSettings


class FakePredictor:
    def predict_aligned_bgr(
        self, aligned_face: np.ndarray, analysis_group: str
    ) -> AnalysisResult:
        assert aligned_face.shape == (224, 224, 3)
        return AnalysisResult(
            AnalysisStatus.UNCERTAIN,
            analysis_group,
            (Suggestion("dog", "강아지상", 0.31),),
        )


class PreparedService(FaceAnalysisService):
    def __init__(self) -> None:
        super().__init__(object(), FakePredictor(), ServiceSettings())  # type: ignore[arg-type]

    def _prepare(self, image: np.ndarray) -> PreparedFace:
        assert image.shape == (16, 16, 3)
        return PreparedFace(
            np.zeros((224, 224, 3), dtype=np.uint8),
            FaceQuality(0.95, 0.2, 0.5, 0.8, 1.0),
            (),
        )


def test_service_returns_relative_score_without_face_data() -> None:
    payload = PreparedService().analyze(
        np.zeros((16, 16, 3), dtype=np.uint8),
        "female",
    )
    assert payload["status"] == "UNCERTAIN"
    assert payload["tags"] == [
        {
            "code": "DOG",
            "displayName": "강아지상",
            "rank": 1,
            "relativeScore": 0.31,
        }
    ]
    serialized = str(payload).lower()
    for forbidden in ("embedding", "landmark", "crop", "celebrity", "user_id"):
        assert forbidden not in serialized
