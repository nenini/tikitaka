package com.date.backend.domain.match.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "match.worker")
public record MatchWorkerProperties(
		long fixedDelayMs,
		long initialDelayMs,
		int batchSize
) {

	public MatchWorkerProperties {
		if (fixedDelayMs <= 0 || initialDelayMs < 0 || batchSize <= 0) {
			throw new IllegalArgumentException("매칭 Worker 설정값이 올바르지 않습니다.");
		}
	}
}
