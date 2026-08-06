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
	public AiChatProperties {
		baseUrl = baseUrl == null ? "" : baseUrl.trim();
		streamPath = streamPath == null || streamPath.isBlank()
				? "/api/v1/chat/stream"
				: streamPath.trim();
		connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
		requestTimeout = requestTimeout == null ? Duration.ofSeconds(270) : requestTimeout;
		sseTimeout = sseTimeout == null ? Duration.ofSeconds(300) : sseTimeout;
		internalToken = internalToken == null ? "" : internalToken.trim();
		if (requestTimeout.isZero() || requestTimeout.isNegative()) {
			throw new IllegalArgumentException("requestTimeout must be positive.");
		}
		if (sseTimeout.compareTo(requestTimeout) <= 0) {
			throw new IllegalArgumentException("sseTimeout must be longer than requestTimeout.");
		}
	}

	public boolean configured() {
		return !baseUrl.isBlank();
	}
}
