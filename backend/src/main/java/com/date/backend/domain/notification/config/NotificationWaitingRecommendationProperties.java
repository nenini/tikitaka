package com.date.backend.domain.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "notification.waiting-recommendation")
public record NotificationWaitingRecommendationProperties(
		int batchSize
) {

	public NotificationWaitingRecommendationProperties {
		if (batchSize <= 0) {
			throw new IllegalArgumentException(
					"장기 미매칭 알림 batch size는 0보다 커야 합니다."
			);
		}
	}
}
