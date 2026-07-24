from __future__ import annotations

import cv2
import numpy as np
import pytest

from face_analysis.input_validation import ImageInputError, decode_validated_image
from face_analysis.settings import ServiceSettings


def encoded_png(width: int = 16, height: int = 16) -> bytes:
    image = np.full((height, width, 3), 127, dtype=np.uint8)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return encoded.tobytes()


def test_decode_validated_image_accepts_matching_memory_payload() -> None:
    image = decode_validated_image(
        encoded_png(),
        "image/png",
        ServiceSettings(),
    )
    assert image.shape == (16, 16, 3)


@pytest.mark.parametrize(
    ("payload", "content_type", "code"),
    [
        (b"not-an-image", "image/png", "MEDIA_TYPE_MISMATCH"),
        (encoded_png(), "image/jpeg", "MEDIA_TYPE_MISMATCH"),
        (encoded_png(), "application/octet-stream", "UNSUPPORTED_MEDIA_TYPE"),
    ],
)
def test_decode_validated_image_rejects_invalid_media(
    payload: bytes, content_type: str, code: str
) -> None:
    with pytest.raises(ImageInputError, match=code):
        decode_validated_image(payload, content_type, ServiceSettings())


def test_decode_validated_image_rejects_large_dimensions() -> None:
    settings = ServiceSettings(max_width=8, max_height=8, max_pixels=64)
    with pytest.raises(ImageInputError, match="IMAGE_DIMENSIONS_TOO_LARGE"):
        decode_validated_image(encoded_png(), "image/png", settings)
