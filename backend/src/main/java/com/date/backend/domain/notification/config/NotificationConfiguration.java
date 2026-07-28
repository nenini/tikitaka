package com.date.backend.domain.notification.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@EnableConfigurationProperties({
		NotificationWorkerProperties.class,
		NotificationSseProperties.class,
		NotificationWaitingRecommendationProperties.class
})
public class NotificationConfiguration {
}
