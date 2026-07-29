package com.date.backend.domain.coach.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ai.session")
public record AiSessionProperties(String internalToken) {
	public AiSessionProperties {
		internalToken = internalToken == null ? "" : internalToken.trim();
	}
}
