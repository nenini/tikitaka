package com.date.backend.domain.room.scheduler;

import com.date.backend.domain.room.application.SessionTimerService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
		prefix = "session.timer",
		name = "enabled",
		havingValue = "true"
)
public class SessionTimerScheduler {
	private final SessionTimerService timerService;

	public SessionTimerScheduler(SessionTimerService timerService) {
		this.timerService = timerService;
	}

	@Scheduled(
			fixedDelayString = "${session.timer.fixed-delay-ms}",
			initialDelayString = "${session.timer.initial-delay-ms}"
	)
	public void publishTimerEvents() {
		timerService.publishTimerEvents();
	}
}
