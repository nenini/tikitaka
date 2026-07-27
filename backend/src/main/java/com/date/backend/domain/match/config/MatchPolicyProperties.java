package com.date.backend.domain.match.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "match.policy")
public record MatchPolicyProperties(long lateCancellationThresholdSeconds) {

	public MatchPolicyProperties {
		if (lateCancellationThresholdSeconds <= 0) {
			throw new IllegalArgumentException("직전 취소 기준 시간은 0초보다 커야 합니다.");
		}
	}
}
