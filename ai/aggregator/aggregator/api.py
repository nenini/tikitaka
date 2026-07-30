"""FastAPI entry point for Backend session lifecycle integration."""

from __future__ import annotations

import hmac
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request

from aggregator.session_contracts import (
    SessionEventRequest,
    SessionEventResponse,
)
from aggregator.session_manager import (
    CoachingSender,
    SessionEventContractError,
    SessionManager,
)
from aggregator.audio_adapter import SessionAudioAdapterFactory
from aggregator.settings import IntegrationSettings


def create_app(
    settings: IntegrationSettings | None = None,
    *,
    sender: CoachingSender | None = None,
    audio_adapter_factory: SessionAudioAdapterFactory | None = None,
) -> FastAPI:
    resolved_settings = settings or IntegrationSettings.from_env()
    manager = SessionManager(
        resolved_settings,
        sender=sender,
        audio_adapter_factory=audio_adapter_factory,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await manager.startup()
        yield
        await manager.close()

    app = FastAPI(
        title="A307 Control Room",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.session_manager = manager

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {
            "status": "UP",
            "activeSessionCount": manager.active_session_count,
            "backendConfigured": resolved_settings.backend_configured,
        }

    @app.post(
        "/api/v1/sessions/events",
        response_model=SessionEventResponse,
        response_model_by_alias=True,
    )
    async def receive_session_event(
        body: SessionEventRequest,
        x_internal_token: str | None = Header(
            default=None,
            alias="X-Internal-Token",
        ),
    ) -> SessionEventResponse:
        _verify_token(resolved_settings.internal_token, x_internal_token)
        try:
            return await manager.handle(body)
        except SessionEventContractError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    return app


def _verify_token(expected: str, received: str | None) -> None:
    if not expected:
        raise HTTPException(
            status_code=500,
            detail="AI_SESSION_INTERNAL_TOKEN is not configured",
        )
    if received is None or not hmac.compare_digest(expected, received):
        raise HTTPException(
            status_code=401,
            detail="Invalid internal token",
        )


def session_manager(request: Request) -> SessionManager:
    """Dependency seam for the later LiveKit STT/Vision adapters."""
    manager: SessionManager = request.app.state.session_manager
    return manager


app = create_app()
