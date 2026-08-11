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
				event.sessionType(),
				event.scenario(),
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
				null,
				null,
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

	@Override
	public QuestionSuggestionResult requestQuestionSuggestion(
			Long sessionId,
			Long userId,
			String requestId
	) {
		URI uri = URI.create(
				properties.baseUrl()
						+ "/api/v1/sessions/" + sessionId + "/coaching-requests"
		);
		HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
				// AI 가 문구를 만든 뒤 응답한다. 세션 이벤트용 타임아웃(기본 5초)보다
				// 오래 걸릴 수 있어 별도로 잡는다.
				.timeout(properties.requestTimeout().plusSeconds(5))
				.header("Accept", "application/json")
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(
						serializeSuggestionRequest(userId, requestId),
						StandardCharsets.UTF_8
				));
		if (!properties.internalToken().isBlank()) {
			builder.header("X-Internal-Token", properties.internalToken());
		}
		try {
			HttpResponse<String> response = httpClient.send(
					builder.build(),
					HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
			);
			return switch (response.statusCode()) {
				case 202 -> QuestionSuggestionResult.CREATED;
				case 404 -> QuestionSuggestionResult.SESSION_NOT_ACTIVE;
				default -> QuestionSuggestionResult.UNAVAILABLE;
			};
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			return QuestionSuggestionResult.UNAVAILABLE;
		} catch (IOException exception) {
			return QuestionSuggestionResult.UNAVAILABLE;
		}
	}

	private String serializeSuggestionRequest(Long userId, String requestId) {
		try {
			return objectMapper.writeValueAsString(java.util.Map.of(
					"userId", String.valueOf(userId),
					"requestId", requestId
			));
		} catch (JsonProcessingException exception) {
			throw new AiSessionEventDeliveryException(
					"Question suggestion request serialization failed.",
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
