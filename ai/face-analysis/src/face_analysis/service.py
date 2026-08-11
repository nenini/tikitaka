"""Face quality and tag analysis without persistence or identity inference."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Protocol

import cv2
import numpy as np

from .inference import AnalysisResult, AnalysisStatus
from .labels import normalize_analysis_group
from .preprocessing import (
    FaceQuality,
    FaceQualityError,
    align_face,
    detect_single_face,
    quality_issues,
)
from .settings import ServiceSettings


NOTICE_CODE = "ENTERTAINMENT_ONLY"
QUALITY_REASON_CODES = {
    "face_not_found": "NO_FACE",
    "multiple_faces": "MULTIPLE_FACES",
    "alignment_failed": "EXTREME_HEAD_POSE",
    "low_light": "LOW_LIGHT",
    "overexposed": "OVEREXPOSED",
    "too_blurry": "SEVERE_BLUR",
    "extreme_roll": "EXTREME_HEAD_POSE",
}


class Predictor(Protocol):
    def predict_aligned_bgr(
        self, aligned_face: np.ndarray, analysis_group: str
    ) -> AnalysisResult: ...


class ModelUnavailableError(RuntimeError):
    """Raised without model paths or user data when tag inference is unavailable."""


@dataclass(frozen=True)
class PreparedFace:
    aligned_face: np.ndarray
    quality: FaceQuality
    reasons: tuple[str, ...]


def _quality_payload(
    quality: FaceQuality | None,
    reasons: tuple[str, ...],
    face_count: int,
) -> dict[str, object]:
    return {
        "usable": quality is not None and not reasons,
        "reasons": list(reasons),
        "faceCount": face_count,
        "faceAreaRatio": quality.face_ratio if quality else None,
        "brightnessScore": quality.brightness_score if quality else None,
        "blurScore": quality.blur_score if quality else None,
        "rollDegrees": quality.roll_degrees if quality else None,
    }


class FaceAnalysisService:
    def __init__(
        self,
        detector: cv2.FaceDetectorYN,
        predictor: Predictor | None,
        settings: ServiceSettings,
    ) -> None:
        self.detector = detector
        self.predictor = predictor
        self.settings = settings
        self._detector_lock = Lock()
        self._predictor_lock = Lock()

    @property
    def analysis_available(self) -> bool:
        return self.predictor is not None

    def close(self) -> None:
        close = getattr(self.predictor, "close", None)
        if callable(close):
            close()

    def _prepare(self, image: np.ndarray) -> PreparedFace:
        with self._detector_lock:
            detection = detect_single_face(
                image,
                self.detector,
                self.settings.min_detection_area_ratio,
            )
            aligned, quality = align_face(
                image,
                detection,
                self.settings.output_size,
            )
        reasons = tuple(
            QUALITY_REASON_CODES[reason]
            for reason in quality_issues(
                quality,
                self.settings.min_brightness,
                self.settings.max_brightness,
                self.settings.min_blur_score,
                self.settings.max_abs_roll,
            )
        )
        return PreparedFace(aligned, quality, reasons)

    def quality_check(self, image: np.ndarray) -> dict[str, object]:
        try:
            prepared = self._prepare(image)
        except FaceQualityError as exc:
            reason = QUALITY_REASON_CODES.get(exc.code, "INVALID_IMAGE")
            face_count = 2 if exc.code == "multiple_faces" else 0
            return self._response(
                AnalysisStatus.RETAKE_REQUIRED,
                None,
                _quality_payload(None, (reason,), face_count),
                [],
            )
        status = (
            AnalysisStatus.SUCCESS
            if not prepared.reasons
            else AnalysisStatus.RETAKE_REQUIRED
        )
        return self._response(
            status,
            None,
            _quality_payload(prepared.quality, prepared.reasons, 1),
            [],
        )

    def analyze(self, image: np.ndarray, analysis_group: str) -> dict[str, object]:
        group = normalize_analysis_group(analysis_group)
        if self.predictor is None:
            raise ModelUnavailableError("MODEL_UNAVAILABLE")
        try:
            prepared = self._prepare(image)
        except FaceQualityError as exc:
            reason = QUALITY_REASON_CODES.get(exc.code, "INVALID_IMAGE")
            face_count = 2 if exc.code == "multiple_faces" else 0
            return self._response(
                AnalysisStatus.RETAKE_REQUIRED,
                group,
                _quality_payload(None, (reason,), face_count),
                [],
            )
        quality = _quality_payload(prepared.quality, prepared.reasons, 1)
        if prepared.reasons:
            return self._response(
                AnalysisStatus.RETAKE_REQUIRED,
                group,
                quality,
                [],
            )
        with self._predictor_lock:
            assert self.predictor is not None
            result = self.predictor.predict_aligned_bgr(prepared.aligned_face, group)
        tags = [
            {
                "code": suggestion.face_type.upper(),
                "displayName": suggestion.face_type_ko,
                "rank": rank,
                "relativeScore": suggestion.relative_score,
            }
            for rank, suggestion in enumerate(result.suggestions, start=1)
        ]
        return self._response(result.status, group, quality, tags)

    def _response(
        self,
        status: AnalysisStatus,
        analysis_group: str | None,
        quality: dict[str, object],
        tags: list[dict[str, object]],
    ) -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "status": status.value,
            "modelVersion": self.settings.model_version,
            "analysisGroup": analysis_group,
            "quality": quality,
            "tags": tags,
            "noticeCode": NOTICE_CODE,
        }
