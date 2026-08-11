from __future__ import annotations

import tempfile

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from face_analysis.api import AnalysisPayload, create_app
from face_analysis.service import ModelUnavailableError
from face_analysis.settings import ServiceSettings


def encoded_png() -> bytes:
    image = np.full((16, 16, 3), 127, dtype=np.uint8)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return encoded.tobytes()


class FakeService:
    analysis_available = True

    def quality_check(self, image: np.ndarray) -> dict[str, object]:
        assert image.shape == (16, 16, 3)
        return response_payload(None, [])

    def analyze(
        self, image: np.ndarray, analysis_group: str
    ) -> dict[str, object]:
        assert image.shape == (16, 16, 3)
        return response_payload(
            analysis_group,
            [
                {
                    "code": "DOG",
                    "displayName": "강아지상",
                    "rank": 1,
                    "relativeScore": 0.4,
                }
            ],
            status="UNCERTAIN",
        )


class DegradedService(FakeService):
    analysis_available = False

    def analyze(
        self, image: np.ndarray, analysis_group: str
    ) -> dict[str, object]:
        raise ModelUnavailableError("MODEL_UNAVAILABLE")


def response_payload(
    group: str | None,
    tags: list[dict[str, object]],
    status: str = "SUCCESS",
) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "status": status,
        "modelVersion": "test-model",
        "analysisGroup": group,
        "quality": {
            "usable": True,
            "reasons": [],
            "faceCount": 1,
            "faceAreaRatio": 0.2,
            "brightnessScore": 0.5,
            "blurScore": 0.8,
            "rollDegrees": 1.0,
        },
        "tags": tags,
        "noticeCode": "ENTERTAINMENT_ONLY",
    }


def test_runtime_initializes_once_and_raw_body_never_uses_spooled_file(
    monkeypatch,
) -> None:
    calls = 0

    def factory(_settings: ServiceSettings):
        nonlocal calls
        calls += 1
        return FakeService()

    def fail_spooled_file(*_args, **_kwargs):
        raise AssertionError("Temporary upload file must not be created.")

    monkeypatch.setattr(tempfile, "SpooledTemporaryFile", fail_spooled_file)
    app = create_app(ServiceSettings(model_version="test-model"), factory)  # type: ignore[arg-type]
    with TestClient(app) as client:
        for _ in range(2):
            response = client.post(
                "/internal/v1/face-analysis/analyze?analysis_group=female",
                content=encoded_png(),
                headers={"content-type": "image/png"},
            )
            assert response.status_code == 200
            assert response.json()["status"] == "UNCERTAIN"
        health = client.get("/internal/v1/face-analysis/health")
        assert health.status_code == 200
        assert health.json()["status"] == "READY"
    assert calls == 1


def test_fe_route_accepts_encoded_blob_and_returns_non_cacheable_json() -> None:
    app = create_app(
        ServiceSettings(model_version="test-model"),
        lambda _settings: FakeService(),  # type: ignore[arg-type]
    )
    with TestClient(app) as client:
        response = client.post(
            "/v1/face-analysis/analyze?analysis_group=female",
            content=encoded_png(),
            headers={"content-type": "image/png"},
        )
        demo_route = client.get("/")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.json()["status"] == "UNCERTAIN"
    assert response.json()["tags"][0]["code"] == "DOG"
    assert demo_route.status_code == 404
    serialized = response.text.lower()
    for forbidden in ("image", "embedding", "landmark", "blendshape", "user_id"):
        assert forbidden not in serialized


def test_ai_response_contract_excludes_skipped_and_unknown_face_type() -> None:
    skipped = response_payload("female", [], status="SKIPPED")
    with pytest.raises(ValidationError):
        AnalysisPayload.model_validate(skipped)

    unknown = response_payload(
        "female",
        [
            {
                "code": "UNKNOWN",
                "displayName": "unknown",
                "rank": 1,
                "relativeScore": 0.4,
            }
        ],
    )
    with pytest.raises(ValidationError):
        AnalysisPayload.model_validate(unknown)


def test_api_rejects_payload_before_decode_when_body_is_too_large() -> None:
    settings = ServiceSettings(max_body_bytes=8, model_version="test-model")
    app = create_app(settings, lambda _settings: FakeService())  # type: ignore[arg-type]
    with TestClient(app) as client:
        response = client.post(
            "/internal/v1/face-analysis/quality-check",
            content=encoded_png(),
            headers={"content-type": "image/png"},
        )
    assert response.status_code == 413
    assert response.json() == {"errorCode": "PAYLOAD_TOO_LARGE"}
    assert response.headers["cache-control"] == "no-store, max-age=0"


def test_api_stays_available_with_generic_model_unavailable_error() -> None:
    def unavailable(_settings: ServiceSettings):
        raise FileNotFoundError("private model path must not be returned")

    app = create_app(ServiceSettings(model_version="test-model"), unavailable)
    with TestClient(app) as client:
        health = client.get("/internal/v1/face-analysis/health")
        response = client.post(
            "/internal/v1/face-analysis/quality-check",
            content=encoded_png(),
            headers={"content-type": "image/png"},
        )
    assert health.status_code == 503
    assert health.json()["status"] == "UNAVAILABLE"
    assert response.status_code == 503
    assert response.json() == {"errorCode": "MODEL_UNAVAILABLE"}
    assert "private model path" not in response.text


def test_classifier_failure_does_not_stop_quality_check() -> None:
    app = create_app(
        ServiceSettings(model_version="test-model"),
        lambda _settings: DegradedService(),  # type: ignore[arg-type]
    )
    with TestClient(app) as client:
        health = client.get("/internal/v1/face-analysis/health")
        quality = client.post(
            "/internal/v1/face-analysis/quality-check",
            content=encoded_png(),
            headers={"content-type": "image/png"},
        )
        analysis = client.post(
            "/internal/v1/face-analysis/analyze?analysis_group=female",
            content=encoded_png(),
            headers={"content-type": "image/png"},
        )
    assert health.status_code == 200
    assert health.json()["status"] == "DEGRADED"
    assert quality.status_code == 200
    assert analysis.status_code == 503
