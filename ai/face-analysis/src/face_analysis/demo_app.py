"""Loopback-only browser demo for local face-analysis verification."""

from __future__ import annotations

import ipaddress
from pathlib import Path

from fastapi import Request, Response
from fastapi.responses import FileResponse, JSONResponse

from .api import ServiceFactory, build_service, create_app
from .settings import ServiceSettings


ASSET_DIR = Path(__file__).resolve().parent / "demo_assets"
LOCAL_TEST_HOST = "testclient"


def _is_loopback(host: str) -> bool:
    if host == LOCAL_TEST_HOST:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def create_demo_app(
    settings: ServiceSettings | None = None,
    service_factory: ServiceFactory = build_service,
):
    """Create a local-only demo without exposing it from the production app."""
    app = create_app(settings, service_factory)
    app.title = "Face Analysis Local Demo"

    @app.middleware("http")
    async def local_demo_boundary(request: Request, call_next):
        client_host = request.client.host if request.client else ""
        if not _is_loopback(client_host):
            return JSONResponse(status_code=403, content={"errorCode": "LOCAL_ONLY"})
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' blob:; "
            "media-src 'self' blob:; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'none'; "
            "frame-ancestors 'none'"
        )
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        return response

    @app.get("/", include_in_schema=False)
    async def demo_index() -> FileResponse:
        return FileResponse(ASSET_DIR / "index.html", media_type="text/html")

    @app.get("/demo.css", include_in_schema=False)
    async def demo_css() -> FileResponse:
        return FileResponse(ASSET_DIR / "demo.css", media_type="text/css")

    @app.get("/demo.js", include_in_schema=False)
    async def demo_js() -> FileResponse:
        return FileResponse(
            ASSET_DIR / "demo.js",
            media_type="text/javascript",
        )

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> Response:
        return Response(status_code=204)

    return app


app = create_demo_app()
