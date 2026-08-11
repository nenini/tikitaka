"""Bounded in-memory image input validation without temporary files."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from starlette.requests import Request

from .settings import ServiceSettings


SUPPORTED_MEDIA_TYPES = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
}


@dataclass(frozen=True)
class ImageInputError(ValueError):
    code: str
    status_code: int

    def __str__(self) -> str:
        return self.code


def _detected_format(payload: bytes) -> str | None:
    if payload.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return "webp"
    return None


async def read_limited_body(request: Request, max_body_bytes: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise ImageInputError("INVALID_CONTENT_LENGTH", 400) from exc
        if declared_size < 0:
            raise ImageInputError("INVALID_CONTENT_LENGTH", 400)
        if declared_size > max_body_bytes:
            raise ImageInputError("PAYLOAD_TOO_LARGE", 413)

    payload = bytearray()
    async for chunk in request.stream():
        payload.extend(chunk)
        if len(payload) > max_body_bytes:
            payload.clear()
            raise ImageInputError("PAYLOAD_TOO_LARGE", 413)
    if not payload:
        raise ImageInputError("INVALID_IMAGE", 400)
    return bytes(payload)


def decode_validated_image(
    payload: bytes,
    content_type: str | None,
    settings: ServiceSettings,
) -> np.ndarray:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    expected_format = SUPPORTED_MEDIA_TYPES.get(media_type)
    if expected_format is None:
        raise ImageInputError("UNSUPPORTED_MEDIA_TYPE", 415)
    if len(payload) > settings.max_body_bytes:
        raise ImageInputError("PAYLOAD_TOO_LARGE", 413)
    if _detected_format(payload) != expected_format:
        raise ImageInputError("MEDIA_TYPE_MISMATCH", 415)

    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ImageInputError("INVALID_IMAGE", 400)
    height, width = image.shape[:2]
    if (
        width > settings.max_width
        or height > settings.max_height
        or width * height > settings.max_pixels
    ):
        raise ImageInputError("IMAGE_DIMENSIONS_TOO_LARGE", 413)
    return image
