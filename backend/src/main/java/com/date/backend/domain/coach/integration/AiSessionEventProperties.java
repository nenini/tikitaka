package com.date.backend.domain.coach.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "ai.session-event")
public record AiSessionEventProperties(
		String baseUrl,
		String eventPath,
		Duration connectTimeout,
		Duration requestTimeout,
		String internalToken,
		int maxAttempts,
		Duration retryDelay
) {
	public AiSessionEventProperties {
		baseUrl = normalizeBaseUrl(baseUrl);
		eventPath = normalizePath(eventPath);
		connectTimeout = positiveOrDefault(
				connectTimeout,
				Duration.ofSeconds(3)
		);
		requestTimeout = positiveOrDefault(
				requestTimeout,
				Duration.ofSeconds(5)
		);
		internalToken = internalToken == null ? "" : internalToken.trim();
		maxAttempts = maxAttempts <= 0 ? 3 : maxAttempts;
		retryDelay = positiveOrDefault(retryDelay, Duration.ofSeconds(1));
	}

	public boolean configured() {
		return !baseUrl.isBlank();
	}

	public String eventUrl() {
		return baseUrl + eventPath;
	}

	private static String normalizeBaseUrl(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		return value.trim().replaceFirst("/+$", "");
	}

	private static String normalizePath(String value) {
		if (value == null || value.isBlank()) {
			return "/api/v1/sessions/events";
		}
		String trimmed = value.trim();
		return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
	}

	private static Duration positiveOrDefault(
			Duration value,
			Duration defaultValue
	) {
		return value == null || value.isZero() || value.isNegative()
				? defaultValue
				: value;
	}
}
