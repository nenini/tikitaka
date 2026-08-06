package com.date.backend.domain.moderation.scheduler;

import com.date.backend.domain.moderation.application.NoShowService;
import com.date.backend.domain.moderation.config.NoShowPolicyProperties;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isA;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NoShowDetectionSchedulerTest {
	@Test
	void scansSessionsWhoseGracePeriodElapsed() {
		WaitingRoomRepository sessionRepository = mock(WaitingRoomRepository.class);
		NoShowService noShowService = mock(NoShowService.class);
		ZoneId zone = ZoneId.of("Asia/Seoul");
		Clock clock = Clock.fixed(Instant.parse("2026-08-06T03:00:00Z"), zone);
		NoShowPolicyProperties properties = new NoShowPolicyProperties(
				Duration.ofMinutes(5), Duration.ofDays(1),
				Duration.ofDays(3), Duration.ofDays(7));
		LocalDateTime deadline = LocalDateTime.now(clock).minusMinutes(5);
		when(sessionRepository.findNoShowCandidateIds(eq(deadline), isA(Pageable.class)))
				.thenReturn(List.of(11L));

		NoShowDetectionScheduler scheduler = new NoShowDetectionScheduler(
				sessionRepository, noShowService, properties, clock, 100);
		scheduler.detectNoShows();

		verify(noShowService).recordAutomatically(11L);
	}
}
