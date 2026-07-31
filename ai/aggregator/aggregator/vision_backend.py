"""Backend v1 adapter for important Vision v4 behavior events."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from aggregator.settings import IntegrationSettings
from aggregator.vision_events import VisionBehaviorEvent

Sleep = Callable[[float], Awaitable[None]]

IMPORTANT_VISION_BEHAVIOR_TYPES = frozenset(
    {
        "GAZE_AWAY_STARTED",
        "GAZE_AWAY_ENDED",
        "PROLONGED_GAZE_AWAY",
        "FACE_MISSING_STARTED",
        "FACE_MISSING_ENDED",
        "ANALYSIS_UNAVAILABLE",
        "ANALYSIS_RECOVERED",
        "LOW_LIGHT_STARTED",
        "LOW_LIGHT_ENDED",
        "SMILE_STARTED",
        "SMILE_ENDED",
        "NOD_EVENT",
    }
)


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BackendVisionAnalysisRequest(_CamelModel):
    event_id: str
    version: Literal[1] = 1
    event_type: Literal["VISION_ANALYSIS"] = "VISION_ANALYSIS"
    source: Literal["AI_SESSION_SERVER"] = "AI_SESSION_SERVER"
    session_id: str
    user_id: str
    participant_identity: str
    client_instance_id: str
    seq: int
    session_elapsed_ms: int
    confidence: float
    occurred_at: str
    model_version: str
    rule_version: str
    payload: dict[str, Any]


class BackendVisionResponseData(_CamelModel):
    event_id: str
    status: Literal["STORED", "DUPLICATE"]


class BackendVisionResponse(_CamelModel):
    success: bool
    data: BackendVisionResponseData


class BackendVisionReceipt(_CamelModel):
    event_id: str
    status: Literal["STORED", "DUPLICATE"]


class BackendVisionDeliveryError(RuntimeError):
    """An important Vision event could not be persisted by Backend."""


def to_backend_vision_request(
    event: VisionBehaviorEvent,
    participant_identity: str,
) -> BackendVisionAnalysisRequest:
    return BackendVisionAnalysisRequest(
        event_id=str(event.event_id),
        session_id=event.session_id,
        user_id=event.user_id,
        participant_identity=participant_identity,
        client_instance_id=str(event.client_instance_id),
        seq=event.seq,
        session_elapsed_ms=int(event.session_elapsed_ms),
        confidence=event.confidence,
        occurred_at=event.occurred_at.isoformat(),
        model_version=event.model_version,
        rule_version=event.rule_version,
        payload={
            "visionContractVersion": 4,
            "visionEventType": event.event_type,
            "kind": event.kind,
            "source": event.source,
            "episodeId": (
                str(event.episode_id) if event.episode_id is not None else None
            ),
            "coachingEligible": event.coaching_eligible,
            "baselineMode": event.baseline_mode,
            "baselineEpoch": event.baseline_epoch,
            "details": event.payload.model_dump(by_alias=True, mode="json"),
        },
    )


class BackendVisionClient:
    """Store important Vision behavior events using Backend contract v1."""

    def __init__(
        self,
        settings: IntegrationSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._owns_http_client = http_client is None
        self._http_client = http_client or httpx.AsyncClient(
            timeout=settings.backend_request_timeout_seconds
        )

    async def send(
        self,
        event: VisionBehaviorEvent,
        participant_identity: str,
    ) -> BackendVisionReceipt:
        if not self._settings.backend_configured:
            raise BackendVisionDeliveryError(
                "BACKEND_BASE_URL and AI_SESSION_INTERNAL_TOKEN are required"
            )
        request = to_backend_vision_request(event, participant_identity)
        url = (
            f"{self._settings.backend_base_url}"
            "/internal/ai/sessions/analysis-events/vision"
        )
        payload = request.model_dump(by_alias=True, mode="json")
        headers = {
            "X-Internal-Token": self._settings.internal_token,
            "Content-Type": "application/json",
        }

        last_error: Exception | None = None
        for attempt in range(1, self._settings.backend_max_attempts + 1):
            try:
                response = await self._http_client.post(
                    url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                parsed = BackendVisionResponse.model_validate(response.json())
                if not parsed.success:
                    raise BackendVisionDeliveryError(
                        f"Backend rejected Vision event {event.event_id}"
                    )
                if parsed.data.event_id != str(event.event_id):
                    raise BackendVisionDeliveryError(
                        "Backend Vision receipt eventId does not match request"
                    )
                return BackendVisionReceipt(
                    event_id=parsed.data.event_id,
                    status=parsed.data.status,
                )
            except (httpx.TransportError, httpx.HTTPStatusError) as error:
                last_error = error
                retryable = (
                    isinstance(error, httpx.TransportError)
                    or error.response.status_code == 429
                    or error.response.status_code >= 500
                )
                if (
                    not retryable
                    or attempt == self._settings.backend_max_attempts
                ):
                    break
                await self._sleep(
                    self._settings.backend_retry_delay_seconds
                )
            except ValueError as error:
                raise BackendVisionDeliveryError(
                    "Backend returned an invalid Vision response"
                ) from error

        raise BackendVisionDeliveryError(
            f"Failed to deliver Vision event {event.event_id}"
        ) from last_error

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()
