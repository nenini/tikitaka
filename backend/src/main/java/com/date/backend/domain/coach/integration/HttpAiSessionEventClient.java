package com.date.backend.domain.coach.integration;

import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.event.AiSessionStartedEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public class HttpAiSessionEventClient implements AiSessionEventClient {
	private final AiSessionEventProperties properties;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;
	private final URI eventUri;

	public HttpAiSessionEventClient(
			AiSessionEventProperties properties,
			ObjectMapper objectMapper
	) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(properties.connectTimeout())
				.build();
		this.eventUri = URI.create(properties.eventUrl());
	}

	@Override
	public boolean configured() {
		return true;
	}

	@Override
	public void send(AiSessionStartedEvent event) {
		send(new AiSessionEventPayload(
				eventId(event.sessionId(), event.eventType()),
				event.eventType(),
				event.version(),
				event.sessionId(),
				event.actualStartAt(),
				null,
				event.liveKit(),
				event.participants(),
				event.features(),
				null
		));
	}

	@Override
	public void send(AiSessionEndedEvent event) {
		send(new AiSessionEventPayload(
				eventId(event.sessionId(), event.eventType()),
				event.eventType(),
				event.version(),
				event.sessionId(),
				null,
				event.endedAt(),
				null,
				null,
				null,
				event.reason()
		));
	}

	private void send(AiSessionEventPayload payload) {
		HttpRequest.Builder builder = HttpRequest.newBuilder(eventUri)
				.timeout(properties.requestTimeout())
				.header("Accept", "application/json")
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(
						serialize(payload),
						StandardCharsets.UTF_8
				));
		if (!properties.internalToken().isBlank()) {
			builder.header(
					"X-Internal-Token",
					properties.internalToken()
			);
		}
		try {
			HttpResponse<String> response = httpClient.send(
					builder.build(),
					HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
			);
			int status = response.statusCode();
			if ((status >= 200 && status < 300) || status == 409) {
				return;
			}
			throw new AiSessionEventDeliveryException(
					"AI session event delivery failed. status=" + status
							+ ", body=" + response.body(),
					status >= 500 || status == 429
			);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new AiSessionEventDeliveryException(
					"AI session event delivery interrupted.",
					exception,
					false
			);
		} catch (IOException exception) {
			throw new AiSessionEventDeliveryException(
					"AI session event delivery failed.",
					exception,
					true
			);
		}
	}

	private String serialize(AiSessionEventPayload payload) {
		try {
			return objectMapper.writeValueAsString(payload);
		} catch (JsonProcessingException exception) {
			throw new AiSessionEventDeliveryException(
					"AI session event serialization failed.",
					exception,
					false
			);
		}
	}

	private static String eventId(String sessionId, String eventType) {
		return "session-" + sessionId + "-"
				+ eventType.toLowerCase().replace('_', '-');
	}
}
