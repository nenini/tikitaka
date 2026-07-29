package com.date.backend.domain.aichat.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "ai.chat")
public record AiChatProperties(
		String baseUrl,
		String streamPath,
		Duration connectTimeout,
		Duration requestTimeout,
		String internalToken
) {
	public AiChatProperties {
		baseUrl = baseUrl == null ? "" : baseUrl.trim();
		streamPath = streamPath == null || streamPath.isBlank()
				? "/api/v1/chat/stream"
				: streamPath.trim();
		connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
		requestTimeout = requestTimeout == null ? Duration.ofSeconds(60) : requestTimeout;
		internalToken = internalToken == null ? "" : internalToken.trim();
	}

	public boolean configured() {
		return !baseUrl.isBlank();
	}
}
