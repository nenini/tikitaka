package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.MatchCompletionService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

@Component
@ConditionalOnProperty(
		prefix = "match.scheduler",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class MatchCompletionScheduler {

	private final MatchCompletionService service;
	private final Clock clock;

	public MatchCompletionScheduler(MatchCompletionService service, Clock clock) {
		this.service = service;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${match.scheduler.fixed-delay-ms:10000}",
			initialDelayString = "${match.scheduler.initial-delay-ms:10000}"
	)
	public void completeFinishedSessions() {
		service.completeFinishedSessions(LocalDateTime.now(clock));
	}
}
