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
from aggregator.report import ReportPublisher
from aggregator.llm_coaching import CoachingMessageGenerator


def create_app(
    settings: IntegrationSettings | None = None,
    *,
    sender: CoachingSender | None = None,
    audio_adapter_factory: SessionAudioAdapterFactory | None = None,
    message_generator: CoachingMessageGenerator | None = None,
    report_publisher: ReportPublisher | None = None,
) -> FastAPI:
    resolved_settings = settings or IntegrationSettings.from_env()
    manager = SessionManager(
        resolved_settings,
        sender=sender,
        audio_adapter_factory=audio_adapter_factory,
        message_generator=message_generator,
        report_publisher=report_publisher,
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
            "retainedTranscriptCount": manager.retained_transcript_count,
            "backendConfigured": resolved_settings.backend_configured,
            "coachingLlmEnabled": resolved_settings.coaching_llm_configured,
            "reportLlmEnabled": resolved_settings.report_llm_configured,
            "pendingReportCount": manager.pending_report_count,
        }

    @app.get("/api/v1/sessions/{session_id}/transcript")
    async def get_transcript(
        session_id: str,
        x_internal_token: str | None = Header(
            default=None,
            alias="X-Internal-Token",
        ),
    ) -> dict[str, object]:
        """신고 처리용 전사 조회 (BE moderation 모듈).

        BE는 `{"transcript": "...", "generatedAt": "..."}`만 읽는다. 본문이 비면
        AI_TRANSCRIPT_EMPTY로 처리하므로, 보관 기간이 지났거나 발화가 없으면
        404로 명확히 알린다 — 빈 문자열을 200으로 주면 원인 구분이 안 된다.

        보관은 세션 종료 후 `transcript_retention_seconds`(기본 30분)뿐이다.
        그 뒤 요청은 404다.
        """
        _verify_token(resolved_settings.internal_token, x_internal_token)
        retained = manager.retained_transcript(session_id)
        if retained is None or not retained.segments:
            raise HTTPException(
                status_code=404,
                detail="retained transcript not found or expired",
            )
        return {
            "sessionId": session_id,
            "transcript": "\n".join(
                f"[{s.start_ms // 1000}s] {s.user_id}: {s.text}" for s in retained.segments
            ),
            "generatedAt": retained.ended_at.isoformat(),
            "segmentCount": retained.segment_count,
            "expiresAt": retained.expires_at.isoformat(),
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
