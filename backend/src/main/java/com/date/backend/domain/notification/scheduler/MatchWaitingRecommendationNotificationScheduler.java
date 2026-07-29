package com.date.backend.domain.notification.scheduler;

import com.date.backend.domain.notification.application.MatchWaitingRecommendationNotificationService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

@Component
@ConditionalOnProperty(
		prefix = "notification.waiting-recommendation",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class MatchWaitingRecommendationNotificationScheduler {

	private final MatchWaitingRecommendationNotificationService service;
	private final Clock clock;

	public MatchWaitingRecommendationNotificationScheduler(
			MatchWaitingRecommendationNotificationService service,
			Clock clock
	) {
		this.service = service;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString =
					"${notification.waiting-recommendation.fixed-delay-ms:600000}",
			initialDelayString =
					"${notification.waiting-recommendation.initial-delay-ms:60000}"
	)
	public void scheduleRecommendations() {
		service.scheduleDue(LocalDateTime.now(clock));
	}
}
