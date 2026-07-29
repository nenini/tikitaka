package com.date.backend.domain.coach.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "ai.session")
public record AiSessionProperties(
		String internalToken,
		Duration coachingMinInterval
) {
	public AiSessionProperties {
		internalToken = internalToken == null ? "" : internalToken.trim();
		coachingMinInterval = coachingMinInterval == null
				? Duration.ofSeconds(10)
				: coachingMinInterval;
		if (coachingMinInterval.isNegative()) {
			throw new IllegalArgumentException(
					"coachingMinInterval은 음수일 수 없습니다."
			);
		}
	}
}
