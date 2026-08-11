package com.date.backend.domain.room.scheduler;

import com.date.backend.domain.room.application.SessionConnectionMonitorService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
		prefix = "session.realtime",
		name = "monitor-enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class SessionConnectionMonitorScheduler {
	private final SessionConnectionMonitorService monitorService;

	public SessionConnectionMonitorScheduler(
			SessionConnectionMonitorService monitorService
	) {
		this.monitorService = monitorService;
	}

	@Scheduled(
			fixedDelayString =
					"${session.realtime.monitor-fixed-delay-ms:5000}",
			initialDelayString =
					"${session.realtime.monitor-initial-delay-ms:5000}"
	)
	public void monitorConnections() {
		monitorService.detectHeartbeatTimeouts();
		monitorService.failExpiredRecoveries();
	}
}
