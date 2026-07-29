package com.date.backend.domain.notification.scheduler;

import com.date.backend.domain.notification.application.NotificationSseService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
		prefix = "notification.sse",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class NotificationSseHeartbeatScheduler {

	private final NotificationSseService sseService;

	public NotificationSseHeartbeatScheduler(
			NotificationSseService sseService
	) {
		this.sseService = sseService;
	}

	@Scheduled(
			fixedDelayString =
					"${notification.sse.heartbeat-interval-ms:30000}",
			initialDelayString =
					"${notification.sse.heartbeat-interval-ms:30000}"
	)
	public void heartbeat() {
		sseService.sendHeartbeat();
	}
}
