package com.date.backend.domain.aichat.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "ai.chat")
public record AiChatProperties(
		String baseUrl,
		String streamPath,
		Duration connectTimeout,
		Duration requestTimeout,
		Duration sseTimeout,
		String internalToken
) {
	private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(270);
	private static final Duration DEFAULT_SSE_TIMEOUT = Duration.ofSeconds(300);

	public AiChatProperties {
		baseUrl = baseUrl == null ? "" : baseUrl.trim();
		streamPath = streamPath == null || streamPath.isBlank()
				? "/api/v1/chat/stream"
				: streamPath.trim();
		connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
		requestTimeout = requestTimeout == null ? DEFAULT_REQUEST_TIMEOUT : requestTimeout;
		sseTimeout = sseTimeout == null ? DEFAULT_SSE_TIMEOUT : sseTimeout;
		if (requestTimeout.isNegative() || requestTimeout.isZero()) {
			throw new IllegalArgumentException("AI chat request timeout must be positive.");
		}
		if (sseTimeout.compareTo(requestTimeout) <= 0) {
			throw new IllegalArgumentException(
					"AI chat SSE timeout must be longer than the AI request timeout."
			);
		}
		internalToken = internalToken == null ? "" : internalToken.trim();
	}

	public boolean configured() {
		return !baseUrl.isBlank();
	}
}
