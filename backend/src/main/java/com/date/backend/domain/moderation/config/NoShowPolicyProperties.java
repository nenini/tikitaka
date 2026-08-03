package com.date.backend.domain.moderation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "moderation.no-show")
public record NoShowPolicyProperties(Duration gracePeriod, Duration firstRestriction,
		Duration secondRestriction, Duration repeatedRestriction) {
	public NoShowPolicyProperties {
		gracePeriod = positiveOrDefault(gracePeriod, Duration.ofMinutes(5));
		firstRestriction = positiveOrDefault(firstRestriction, Duration.ofDays(1));
		secondRestriction = positiveOrDefault(secondRestriction, Duration.ofDays(3));
		repeatedRestriction = positiveOrDefault(repeatedRestriction, Duration.ofDays(7));
	}
	public Duration restrictionFor(int count) {
		if (count <= 1) return firstRestriction;
		if (count == 2) return secondRestriction;
		return repeatedRestriction;
	}
	private static Duration positiveOrDefault(Duration value, Duration fallback) {
		return value == null || value.isZero() || value.isNegative() ? fallback : value;
	}
}
