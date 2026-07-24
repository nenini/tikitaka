"""Environment-backed settings for the internal face-analysis service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast


SimilarityScoringMethod = Literal[
    "person_similarity_mean",
    "group_centered_class_centroid",
]


@dataclass(frozen=True)
class ServiceSettings:
    face_model_path: Path = Path("artifacts/face_detection_yunet_2023mar.onnx")
    face_landmarker_path: Path = Path("artifacts/face_landmarker.task")
    facenet_home: Path = Path("artifacts")
    reference_data_root: Path = Path("data")
    reference_report_path: Path = Path("data/processing_report.csv")
    model_version: str = "face-type-facenet-geometry-v3-experimental"
    reference_batch_size: int = 16
    similarity_top_k: int = 4
    similarity_temperature: float = 0.20
    similarity_scoring_method: SimilarityScoringMethod = (
        "group_centered_class_centroid"
    )
    geometry_temperature: float = 1.0
    geometry_tie_margin: float = 0.02
    geometry_weight: float = 0.80
    max_body_bytes: int = 5 * 1024 * 1024
    max_width: int = 4096
    max_height: int = 4096
    max_pixels: int = 16_000_000
    detection_threshold: float = 0.78
    min_detection_area_ratio: float = 0.01
    min_brightness: float = 0.16
    max_brightness: float = 0.94
    min_blur_score: float = 0.22
    max_abs_roll: float = 20.0
    success_threshold: float = 0.30
    minimum_margin: float = 0.08
    second_suggestion_threshold: float = 0.25
    output_size: int = 224

    def __post_init__(self) -> None:
        if self.max_body_bytes < 1 or self.max_pixels < 1:
            raise ValueError("Input limits must be positive.")
        if self.reference_batch_size < 1 or self.similarity_top_k < 1:
            raise ValueError("Reference scoring limits must be positive.")
        if self.similarity_temperature <= 0 or self.geometry_temperature <= 0:
            raise ValueError("Scoring temperatures must be positive.")
        if not 0.0 <= self.geometry_tie_margin <= 1.0:
            raise ValueError("geometry_tie_margin must be between 0 and 1.")
        if not 0.5 <= self.geometry_weight <= 1.0:
            raise ValueError("geometry_weight must be between 0.5 and 1.")
        if self.similarity_scoring_method not in {
            "person_similarity_mean",
            "group_centered_class_centroid",
        }:
            raise ValueError("Unsupported similarity_scoring_method.")
        if self.max_width < 1 or self.max_height < 1:
            raise ValueError("Image dimension limits must be positive.")
        if self.output_size < 64:
            raise ValueError("output_size must be at least 64.")
        unit_interval_values = (
            self.detection_threshold,
            self.min_detection_area_ratio,
            self.min_brightness,
            self.max_brightness,
            self.min_blur_score,
            self.success_threshold,
            self.minimum_margin,
            self.second_suggestion_threshold,
        )
        if any(value < 0.0 or value > 1.0 for value in unit_interval_values):
            raise ValueError("Normalized thresholds must be between 0 and 1.")
        if self.min_brightness >= self.max_brightness or self.max_abs_roll <= 0:
            raise ValueError("Quality threshold ranges are invalid.")

    @classmethod
    def from_env(cls) -> ServiceSettings:
        return cls(
            face_model_path=Path(
                os.getenv(
                    "FACE_ANALYSIS_YUNET_PATH",
                    "artifacts/face_detection_yunet_2023mar.onnx",
                )
            ),
            face_landmarker_path=Path(
                os.getenv(
                    "FACE_ANALYSIS_LANDMARKER_PATH",
                    "artifacts/face_landmarker.task",
                )
            ),
            facenet_home=Path(
                os.getenv(
                    "FACE_ANALYSIS_FACENET_HOME",
                    "artifacts",
                )
            ),
            reference_data_root=Path(
                os.getenv(
                    "FACE_ANALYSIS_REFERENCE_DATA_ROOT",
                    "data",
                )
            ),
            reference_report_path=Path(
                os.getenv(
                    "FACE_ANALYSIS_REFERENCE_REPORT_PATH",
                    "data/processing_report.csv",
                )
            ),
            model_version=os.getenv(
                "FACE_ANALYSIS_MODEL_VERSION",
                "face-type-facenet-geometry-v3-experimental",
            ),
            reference_batch_size=int(
                os.getenv("FACE_ANALYSIS_REFERENCE_BATCH_SIZE", "16")
            ),
            similarity_top_k=int(
                os.getenv("FACE_ANALYSIS_SIMILARITY_TOP_K", "4")
            ),
            similarity_temperature=float(
                os.getenv("FACE_ANALYSIS_SIMILARITY_TEMPERATURE", "0.20")
            ),
            similarity_scoring_method=cast(
                SimilarityScoringMethod,
                os.getenv(
                    "FACE_ANALYSIS_SIMILARITY_SCORING_METHOD",
                    "group_centered_class_centroid",
                ),
            ),
            geometry_temperature=float(
                os.getenv("FACE_ANALYSIS_GEOMETRY_TEMPERATURE", "1.0")
            ),
            geometry_tie_margin=float(
                os.getenv("FACE_ANALYSIS_GEOMETRY_TIE_MARGIN", "0.02")
            ),
            geometry_weight=float(
                os.getenv("FACE_ANALYSIS_GEOMETRY_WEIGHT", "0.80")
            ),
            max_body_bytes=int(
                os.getenv("FACE_ANALYSIS_MAX_BODY_BYTES", str(5 * 1024 * 1024))
            ),
            max_width=int(os.getenv("FACE_ANALYSIS_MAX_WIDTH", "4096")),
            max_height=int(os.getenv("FACE_ANALYSIS_MAX_HEIGHT", "4096")),
            max_pixels=int(os.getenv("FACE_ANALYSIS_MAX_PIXELS", "16000000")),
            detection_threshold=float(
                os.getenv("FACE_ANALYSIS_DETECTION_THRESHOLD", "0.78")
            ),
            min_detection_area_ratio=float(
                os.getenv("FACE_ANALYSIS_MIN_FACE_RATIO", "0.01")
            ),
            min_brightness=float(
                os.getenv("FACE_ANALYSIS_MIN_BRIGHTNESS", "0.16")
            ),
            max_brightness=float(
                os.getenv("FACE_ANALYSIS_MAX_BRIGHTNESS", "0.94")
            ),
            min_blur_score=float(
                os.getenv("FACE_ANALYSIS_MIN_BLUR_SCORE", "0.22")
            ),
            max_abs_roll=float(os.getenv("FACE_ANALYSIS_MAX_ABS_ROLL", "20.0")),
            success_threshold=float(
                os.getenv("FACE_ANALYSIS_SUCCESS_THRESHOLD", "0.30")
            ),
            minimum_margin=float(
                os.getenv("FACE_ANALYSIS_MINIMUM_MARGIN", "0.08")
            ),
            second_suggestion_threshold=float(
                os.getenv("FACE_ANALYSIS_SECOND_SUGGESTION_THRESHOLD", "0.25")
            ),
            output_size=int(os.getenv("FACE_ANALYSIS_OUTPUT_SIZE", "224")),
        )
