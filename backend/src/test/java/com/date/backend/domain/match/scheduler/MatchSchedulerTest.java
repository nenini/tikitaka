package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.MatchExpirationService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MatchSchedulerTest {

	@Test
	void expiresOverdueMatches() {
		MatchExpirationService expirationService = mock(MatchExpirationService.class);
		ZoneId zoneId = ZoneId.of("Asia/Seoul");
		Clock clock = Clock.fixed(
				Instant.parse("2026-07-27T01:00:00Z"),
				zoneId
		);
		MatchScheduler scheduler = new MatchScheduler(
				expirationService,
				clock
		);
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);

		scheduler.expireOverdueMatches();

		verify(expirationService).expireOverdue(matchedAt);
	}
}
