package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.MatchExpirationService;
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
public class MatchScheduler {

	private final MatchExpirationService expirationService;
	private final Clock clock;

	public MatchScheduler(
			MatchExpirationService expirationService,
			Clock clock
	) {
		this.expirationService = expirationService;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${match.scheduler.fixed-delay-ms:10000}",
			initialDelayString = "${match.scheduler.initial-delay-ms:10000}"
	)
	public void expireOverdueMatches() {
		expirationService.expireOverdue(LocalDateTime.now(clock));
	}
}
