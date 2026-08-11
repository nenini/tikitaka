package com.date.backend.domain.moderation.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "ai.transcript")
public record AiTranscriptProperties(String baseUrl, String pathTemplate,
		Duration connectTimeout, Duration requestTimeout, String internalToken,
		int maxAttempts, Duration retryDelay) {
	public AiTranscriptProperties {
		baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceFirst("/+$", "");
		pathTemplate = pathTemplate == null || pathTemplate.isBlank()
				? "/api/v1/sessions/{sessionId}/transcript" : normalizePath(pathTemplate);
		connectTimeout = positiveOrDefault(connectTimeout, Duration.ofSeconds(3));
		requestTimeout = positiveOrDefault(requestTimeout, Duration.ofSeconds(15));
		internalToken = internalToken == null ? "" : internalToken.trim();
		maxAttempts = maxAttempts <= 0 ? 5 : maxAttempts;
		retryDelay = positiveOrDefault(retryDelay, Duration.ofSeconds(2));
	}
	public boolean configured() { return !baseUrl.isBlank(); }
	public String transcriptUrl(Long sessionId) {
		return baseUrl + pathTemplate.replace("{sessionId}", sessionId.toString());
	}
	private static String normalizePath(String value) {
		String trimmed = value.trim();
		return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
	}
	private static Duration positiveOrDefault(Duration value, Duration fallback) {
		return value == null || value.isZero() || value.isNegative() ? fallback : value;
	}
}
