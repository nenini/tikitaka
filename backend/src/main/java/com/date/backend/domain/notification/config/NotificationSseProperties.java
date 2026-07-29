package com.date.backend.domain.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "notification.sse")
public record NotificationSseProperties(
		long timeoutMs,
		long retryMs
) {

	public NotificationSseProperties {
		if (timeoutMs <= 0 || retryMs <= 0) {
			throw new IllegalArgumentException(
					"SSE timeout과 retry 설정은 0보다 커야 합니다."
			);
		}
	}
}
