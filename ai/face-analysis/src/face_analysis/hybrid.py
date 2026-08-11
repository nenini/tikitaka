"""Geometry-first face-type scoring with FaceNet used only for ambiguity."""

from __future__ import annotations

import numpy as np

from .facenet import (
    GROUP_CENTERED_CLASS_CENTROID,
    FaceEmbedder,
    ReferenceMemory,
    SimilarityScoringMethod,
    face_type_relative_scores,
)
from .geometry import (
    GeometryExtractionError,
    GeometryExtractor,
    GeometryReferenceMemory,
    geometry_relative_scores,
)
from .inference import AnalysisResult, PredictionPolicy, result_from_probabilities


def geometry_first_scores(
    geometry_scores: np.ndarray,
    facenet_scores: np.ndarray | None,
    *,
    tie_margin: float = 0.08,
    geometry_weight: float = 0.80,
) -> tuple[np.ndarray, bool]:
    geometry = np.asarray(geometry_scores, dtype=np.float64).reshape(-1)
    if (
        geometry.size < 2
        or not np.isfinite(geometry).all()
        or np.any(geometry < 0)
        or geometry.sum() <= 0
    ):
        raise ValueError("Geometry scores must be finite and non-negative.")
    if not 0 <= tie_margin <= 1 or not 0.5 <= geometry_weight <= 1:
        raise ValueError("Hybrid scoring parameters are outside supported bounds.")
    geometry /= geometry.sum()
    ranking = np.sort(geometry)[::-1]
    if ranking[0] - ranking[1] >= tie_margin or facenet_scores is None:
        return geometry.astype(np.float32), False

    facenet = np.asarray(facenet_scores, dtype=np.float64).reshape(-1)
    if (
        facenet.shape != geometry.shape
        or not np.isfinite(facenet).all()
        or np.any(facenet < 0)
        or facenet.sum() <= 0
    ):
        raise ValueError("FaceNet scores must match geometry scores.")
    facenet /= facenet.sum()
    epsilon = np.finfo(np.float64).eps
    log_scores = (
        geometry_weight * np.log(np.maximum(geometry, epsilon))
        + (1.0 - geometry_weight) * np.log(np.maximum(facenet, epsilon))
    )
    log_scores -= log_scores.max()
    combined = np.exp(log_scores)
    return (combined / combined.sum()).astype(np.float32), True


def facenet_shortlist_geometry_scores(
    geometry_scores: np.ndarray,
    facenet_scores: np.ndarray,
    *,
    tie_margin: float = 0.02,
    geometry_weight: float = 0.80,
) -> tuple[np.ndarray, bool]:
    """Re-rank only FaceNet's top two when its own result is ambiguous."""
    geometry = np.asarray(geometry_scores, dtype=np.float64).reshape(-1)
    facenet = np.asarray(facenet_scores, dtype=np.float64).reshape(-1)
    if (
        geometry.shape != facenet.shape
        or geometry.size < 2
        or not np.isfinite(geometry).all()
        or not np.isfinite(facenet).all()
        or np.any(geometry < 0)
        or np.any(facenet < 0)
        or geometry.sum() <= 0
        or facenet.sum() <= 0
    ):
        raise ValueError("Geometry and FaceNet scores must be compatible.")
    if not 0 <= tie_margin <= 1 or not 0.5 <= geometry_weight <= 1:
        raise ValueError("Hybrid scoring parameters are outside supported bounds.")
    geometry /= geometry.sum()
    facenet /= facenet.sum()
    top_two = np.argsort(facenet)[-2:][::-1]
    if facenet[top_two[0]] - facenet[top_two[1]] >= tie_margin:
        return facenet.astype(np.float32), False

    epsilon = np.finfo(np.float64).eps
    shortlist_logs = (
        geometry_weight * np.log(np.maximum(geometry[top_two], epsilon))
        + (1.0 - geometry_weight)
        * np.log(np.maximum(facenet[top_two], epsilon))
    )
    result = facenet.copy()
    geometry_winner = int(top_two[int(np.argmax(shortlist_logs))])
    if geometry_winner != int(top_two[0]):
        result[top_two[0]], result[top_two[1]] = (
            result[top_two[1]],
            result[top_two[0]],
        )
    return result.astype(np.float32), True


class GeometryAssistedPredictor:
    """Use geometry to re-rank only an ambiguous FaceNet top-two shortlist."""

    def __init__(
        self,
        geometry_extractor: GeometryExtractor,
        geometry_references: GeometryReferenceMemory,
        facenet_embedder: FaceEmbedder,
        facenet_references: ReferenceMemory,
        policy: PredictionPolicy | None = None,
        *,
        geometry_temperature: float = 1.0,
        geometry_tie_margin: float = 0.02,
        geometry_weight: float = 0.80,
        facenet_temperature: float = 0.20,
        facenet_top_k: int = 4,
        facenet_scoring_method: SimilarityScoringMethod = (
            GROUP_CENTERED_CLASS_CENTROID
        ),
    ) -> None:
        if (
            geometry_temperature <= 0
            or facenet_temperature <= 0
            or facenet_top_k < 1
        ):
            raise ValueError("Scoring temperatures must be positive.")
        self.geometry_extractor = geometry_extractor
        self.geometry_references = geometry_references
        self.facenet_embedder = facenet_embedder
        self.facenet_references = facenet_references
        self.policy = policy or PredictionPolicy()
        self.geometry_temperature = geometry_temperature
        self.geometry_tie_margin = geometry_tie_margin
        self.geometry_weight = geometry_weight
        self.facenet_temperature = facenet_temperature
        self.facenet_top_k = facenet_top_k
        self.facenet_scoring_method = facenet_scoring_method

    def predict_aligned_bgr(
        self,
        aligned_face: np.ndarray,
        analysis_group: str,
    ) -> AnalysisResult:
        query = self.facenet_embedder.embed_bgr_batch([aligned_face])[0]
        facenet_scores = face_type_relative_scores(
            query,
            analysis_group,
            self.facenet_references,
            top_k=self.facenet_top_k,
            temperature=self.facenet_temperature,
            scoring_method=self.facenet_scoring_method,
        )
        ranking = np.sort(facenet_scores)[::-1]
        if float(ranking[0] - ranking[1]) >= self.geometry_tie_margin:
            return result_from_probabilities(
                facenet_scores,
                analysis_group,
                self.policy,
            )
        try:
            geometry_feature = self.geometry_extractor.extract_bgr_batch(
                [aligned_face]
            )[0]
            geometry_scores = geometry_relative_scores(
                geometry_feature,
                analysis_group,
                self.geometry_references,
                temperature=self.geometry_temperature,
            )
            scores, _ = facenet_shortlist_geometry_scores(
                geometry_scores,
                facenet_scores,
                tie_margin=self.geometry_tie_margin,
                geometry_weight=self.geometry_weight,
            )
        except (GeometryExtractionError, RuntimeError, ValueError):
            scores = facenet_scores
        return result_from_probabilities(scores, analysis_group, self.policy)

    def close(self) -> None:
        close = getattr(self.geometry_extractor, "close", None)
        if callable(close):
            close()
