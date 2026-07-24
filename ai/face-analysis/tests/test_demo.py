from __future__ import annotations

from fastapi.testclient import TestClient

from face_analysis.demo_app import create_demo_app
from face_analysis.settings import ServiceSettings


class FakeService:
    analysis_available = True


def demo_client() -> TestClient:
    app = create_demo_app(
        ServiceSettings(model_version="test-model"),
        lambda _settings: FakeService(),  # type: ignore[arg-type]
    )
    return TestClient(app)


def test_demo_is_served_with_local_privacy_headers() -> None:
    with demo_client() as client:
        response = client.get("/")
    assert response.status_code == 200
    assert "나와 가까운 얼굴상은?" in response.text
    assert 'src="/demo.js"' in response.text
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["permissions-policy"] == "camera=(self), microphone=()"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_demo_assets_are_local_and_contain_no_tracking_or_upload_form() -> None:
    with demo_client() as client:
        html = client.get("/")
        css = client.get("/demo.css")
        script = client.get("/demo.js")
    assert html.status_code == 200
    assert css.status_code == 200
    assert script.status_code == 200
    assert "getUserMedia" in script.text
    assert "quality-check" in script.text
    assert 'id="selectPhotoButton"' in html.text
    assert "context.scale(-1, 1)" not in script.text
    assert "formData" not in script.text
    assert "localStorage" not in script.text
    assert "sessionStorage" not in script.text
    assert "http://" not in script.text
    assert "https://" not in script.text


def test_demo_app_keeps_openapi_disabled() -> None:
    with demo_client() as client:
        response = client.get("/openapi.json")
    assert response.status_code == 404


def test_demo_rejects_non_loopback_clients() -> None:
    app = create_demo_app(
        ServiceSettings(model_version="test-model"),
        lambda _settings: FakeService(),  # type: ignore[arg-type]
    )
    with TestClient(app, client=("203.0.113.10", 50000)) as client:
        response = client.get("/")
    assert response.status_code == 403
    assert response.json() == {"errorCode": "LOCAL_ONLY"}
