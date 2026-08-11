"""YuNet detection and five-landmark face alignment."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class FaceQuality:
    face_confidence: float
    face_ratio: float
    brightness_score: float
    blur_score: float
    roll_degrees: float

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


class FaceQualityError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def create_detector(
    model_path: Path, score_threshold: float = 0.78
) -> cv2.FaceDetectorYN:
    if not model_path.is_file():
        raise FileNotFoundError(f"YuNet 모델이 없습니다: {model_path}")
    return cv2.FaceDetectorYN.create(
        str(model_path),
        "",
        (320, 320),
        score_threshold=score_threshold,
        nms_threshold=0.3,
        top_k=5000,
    )


def detect_single_face(
    image: np.ndarray,
    detector: cv2.FaceDetectorYN,
    min_detection_area_ratio: float = 0.01,
) -> np.ndarray:
    if image is None or image.size == 0:
        raise FaceQualityError("image_decode_failed", "이미지를 읽을 수 없습니다.")
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, detections = detector.detect(image)
    if detections is None:
        raise FaceQualityError("face_not_found", "얼굴을 찾지 못했습니다.")
    image_area = float(width * height)
    faces = [
        detection
        for detection in detections
        if float(detection[2] * detection[3]) / image_area >= min_detection_area_ratio
    ]
    if not faces:
        raise FaceQualityError(
            "face_not_found", "충분한 크기의 얼굴을 찾지 못했습니다."
        )
    if len(faces) > 1:
        raise FaceQualityError(
            "multiple_faces", "한 장에 얼굴이 두 명 이상 검출됐습니다."
        )
    return np.asarray(faces[0], dtype=np.float32)


def _ordered_landmarks(detection: np.ndarray) -> np.ndarray:
    eyes = sorted((detection[4:6], detection[6:8]), key=lambda point: float(point[0]))
    nose = detection[8:10]
    mouths = sorted(
        (detection[10:12], detection[12:14]), key=lambda point: float(point[0])
    )
    return np.asarray([eyes[0], eyes[1], nose, mouths[0], mouths[1]], dtype=np.float32)


def _target_landmarks(output_size: int) -> np.ndarray:
    # ArcFace's common 112px alignment template, scaled to the requested output.
    template = np.asarray(
        [
            [38.2946, 51.6963],
            [73.5318, 51.5014],
            [56.0252, 71.7366],
            [41.5493, 92.3655],
            [70.7299, 92.2041],
        ],
        dtype=np.float32,
    )
    return template * (float(output_size) / 112.0)


def _roll_degrees(detection: np.ndarray) -> float:
    eyes = _ordered_landmarks(detection)[:2]
    return math.degrees(
        math.atan2(float(eyes[1, 1] - eyes[0, 1]), float(eyes[1, 0] - eyes[0, 0]))
    )


def align_face(
    image: np.ndarray,
    detection: np.ndarray,
    output_size: int = 224,
) -> tuple[np.ndarray, FaceQuality]:
    """Align a face and reflect-pad pixels that fall outside the source frame."""
    if output_size < 64:
        raise ValueError("output_size는 64 이상이어야 합니다.")
    source = _ordered_landmarks(detection)
    target = _target_landmarks(output_size)
    matrix, _ = cv2.estimateAffinePartial2D(source, target, method=cv2.LMEDS)
    if matrix is None:
        raise FaceQualityError("alignment_failed", "얼굴 landmark 정렬에 실패했습니다.")
    aligned = cv2.warpAffine(
        image,
        matrix,
        (output_size, output_size),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean() / 255.0)
    variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur = variance / (variance + 100.0)
    height, width = image.shape[:2]
    face_ratio = float(detection[2] * detection[3]) / float(width * height)
    quality = FaceQuality(
        face_confidence=round(float(detection[-1]), 5),
        face_ratio=round(face_ratio, 5),
        brightness_score=round(brightness, 4),
        blur_score=round(blur, 4),
        roll_degrees=round(_roll_degrees(detection), 3),
    )
    return aligned, quality


def quality_issues(
    quality: FaceQuality,
    min_brightness: float = 0.16,
    max_brightness: float = 0.94,
    min_blur_score: float = 0.22,
    max_abs_roll: float = 20.0,
) -> tuple[str, ...]:
    issues: list[str] = []
    if quality.brightness_score < min_brightness:
        issues.append("low_light")
    if quality.brightness_score > max_brightness:
        issues.append("overexposed")
    if quality.blur_score < min_blur_score:
        issues.append("too_blurry")
    if abs(quality.roll_degrees) > max_abs_roll:
        issues.append("extreme_roll")
    return tuple(issues)
