package com.date.backend.domain.moderation.integration;

import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

public class HttpAiSessionTranscriptClient implements AiSessionTranscriptClient {
	private final AiTranscriptProperties properties;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;

	public HttpAiSessionTranscriptClient(AiTranscriptProperties properties, ObjectMapper objectMapper) {
		this.properties = properties; this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build();
	}

	@Override
	public boolean configured() { return true; }

	@Override
	public AiSessionTranscript getTranscript(Long sessionId) {
		HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(properties.transcriptUrl(sessionId)))
				.timeout(properties.requestTimeout()).header("Accept", "application/json").GET();
		if (!properties.internalToken().isBlank()) {
			builder.header("X-Internal-Token", properties.internalToken());
		}
		try {
			HttpResponse<String> response = httpClient.send(builder.build(),
					HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new BusinessException(ModerationErrorCode.AI_TRANSCRIPT_FETCH_FAILED);
			}
			JsonNode root = objectMapper.readTree(response.body());
			String transcript = root.path("transcript").asText("").trim();
			if (transcript.isBlank()) {
				throw new BusinessException(ModerationErrorCode.AI_TRANSCRIPT_EMPTY);
			}
			LocalDateTime generatedAt = root.hasNonNull("generatedAt")
					? LocalDateTime.parse(root.get("generatedAt").asText()) : null;
			return new AiSessionTranscript(sessionId, transcript, generatedAt);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new BusinessException(ModerationErrorCode.AI_TRANSCRIPT_FETCH_FAILED);
		} catch (IOException | RuntimeException exception) {
			if (exception instanceof BusinessException businessException) throw businessException;
			throw new BusinessException(ModerationErrorCode.AI_TRANSCRIPT_FETCH_FAILED);
		}
	}
}
