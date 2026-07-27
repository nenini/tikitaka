package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.config.MatchWorkerProperties;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
public class MatchJobRetryPolicy {

	private final MatchWorkerProperties properties;

	public MatchJobRetryPolicy(MatchWorkerProperties properties) {
		this.properties = properties;
	}

	public boolean canRetry(int attemptCount) {
		return attemptCount < properties.maxAttempts();
	}

	public LocalDateTime nextAvailableAt(
			int attemptCount,
			LocalDateTime failedAt
	) {
		long delay = properties.initialBackoffSeconds();
		for (int attempt = 1; attempt < attemptCount; attempt++) {
			if (delay >= properties.maxBackoffSeconds()) {
				delay = properties.maxBackoffSeconds();
				break;
			}
			if (delay > properties.maxBackoffSeconds() / 2) {
				delay = properties.maxBackoffSeconds();
			} else {
				delay = Math.min(delay * 2, properties.maxBackoffSeconds());
			}
		}
		return failedAt.plusSeconds(delay);
	}
}
