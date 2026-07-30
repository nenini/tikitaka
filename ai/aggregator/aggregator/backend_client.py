"""Async client that delivers coaching commands to Backend."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import httpx

from aggregator.backend_contracts import (
    BackendCoachingReceipt,
    BackendCoachingResponse,
    to_backend_coaching_request,
)
from aggregator.coaching import CoachingCommand
from aggregator.settings import IntegrationSettings

Sleep = Callable[[float], Awaitable[None]]


class BackendDeliveryError(RuntimeError):
    """A command could not be delivered after the configured attempts."""


class BackendCoachingClient:
    """Send one logical event with the same IDs across every retry."""

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
        command: CoachingCommand,
    ) -> BackendCoachingReceipt:
        if not self._settings.backend_configured:
            raise BackendDeliveryError(
                "BACKEND_BASE_URL and AI_SESSION_INTERNAL_TOKEN are required"
            )
        request = to_backend_coaching_request(command)
        url = (
            f"{self._settings.backend_base_url}"
            "/internal/ai/coaching-events"
        )
        payload = request.model_dump(
            by_alias=True,
            mode="json",
        )
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
                if response.status_code == 429 or response.status_code >= 500:
                    response.raise_for_status()
                response.raise_for_status()
                try:
                    parsed = BackendCoachingResponse.model_validate(
                        response.json()
                    )
                except ValueError as error:
                    raise BackendDeliveryError(
                        "Backend returned an invalid coaching response"
                    ) from error
                if not parsed.success:
                    raise BackendDeliveryError(
                        f"Backend rejected coaching event {command.event_id}"
                    )
                if parsed.data.event_id != command.event_id:
                    raise BackendDeliveryError(
                        "Backend coaching receipt eventId does not match request"
                    )
                return BackendCoachingReceipt(
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

        raise BackendDeliveryError(
            f"Failed to deliver coaching event {command.event_id}"
        ) from last_error

    async def close(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()
