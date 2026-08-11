package com.date.backend.domain.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "notification.worker")
public record NotificationWorkerProperties(
		int batchSize,
		int maxAttempts,
		long retryDelaySeconds,
		long processingTimeoutSeconds
) {

	public NotificationWorkerProperties {
		if (batchSize <= 0
				|| maxAttempts <= 0
				|| retryDelaySeconds <= 0
				|| processingTimeoutSeconds <= 0) {
			throw new IllegalArgumentException(
					"알림 Worker 설정값은 모두 0보다 커야 합니다."
			);
		}
	}
}
