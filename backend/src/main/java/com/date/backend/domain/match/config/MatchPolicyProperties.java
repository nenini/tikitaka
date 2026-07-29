package com.date.backend.domain.match.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "match.policy")
public record MatchPolicyProperties(long settingRecommendationDelaySeconds) {

	public MatchPolicyProperties {
		if (settingRecommendationDelaySeconds <= 0) {
			throw new IllegalArgumentException(
					"매칭 설정 변경 권유 지연 시간은 0초보다 커야 합니다."
			);
		}
	}
}
