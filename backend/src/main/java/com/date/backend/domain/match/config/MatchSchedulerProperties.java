package com.date.backend.domain.match.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "match.scheduler")
public record MatchSchedulerProperties(
		long fixedDelayMs,
		long initialDelayMs,
		int batchSize,
		long acceptanceTimeoutSeconds,
		long scheduleBufferSeconds
) {

	public MatchSchedulerProperties {
		if (fixedDelayMs <= 0
				|| initialDelayMs < 0
				|| batchSize <= 0
				|| acceptanceTimeoutSeconds <= 0
				|| scheduleBufferSeconds < 0) {
			throw new IllegalArgumentException("매칭 스케줄러 설정값이 올바르지 않습니다.");
		}
	}
}
