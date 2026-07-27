package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.MatchCandidate;
import com.date.backend.domain.match.application.MatchCandidateService;
import com.date.backend.domain.match.application.MatchCreationService;
import com.date.backend.domain.match.application.MatchExpirationService;
import com.date.backend.domain.match.config.MatchSchedulerProperties;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.policy.MatchScore;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchSchedulerTest {

	@Test
	void findsCandidateAndCreatesMatchUsingConfiguredDeadlineAndBuffer() {
		MatchRequestRepository requestRepository = mock(MatchRequestRepository.class);
		MatchCandidateService candidateService = mock(MatchCandidateService.class);
		MatchCreationService creationService = mock(MatchCreationService.class);
		MatchExpirationService expirationService = mock(MatchExpirationService.class);
		MatchSchedulerProperties properties = new MatchSchedulerProperties(
				10_000,
				10_000,
				100,
				300,
				3_600
		);
		ZoneId zoneId = ZoneId.of("Asia/Seoul");
		Clock clock = Clock.fixed(
				Instant.parse("2026-07-27T01:00:00Z"),
				zoneId
		);
		MatchScheduler scheduler = new MatchScheduler(
				requestRepository,
				candidateService,
				creationService,
				expirationService,
				properties,
				clock
		);
		MatchRequest source = request(1L);
		MatchRequest candidateRequest = request(2L);
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime deadline = matchedAt.plusMinutes(5);
		LocalDateTime earliestSessionStart = deadline.plusHours(1);
		MatchCandidate candidate = new MatchCandidate(
				candidateRequest,
				new MatchScore(
						new BigDecimal("25.000"),
						new BigDecimal("25.000"),
						new BigDecimal("50.000")
				),
				earliestSessionStart
		);

		when(requestRepository.findAllByStatusOrderByRequestedAtAscIdAsc(
				MatchRequestStatus.WAITING,
				PageRequest.of(0, 100)
		)).thenReturn(List.of(source));
		when(candidateService.findBestCandidate(1L, earliestSessionStart))
				.thenReturn(Optional.of(candidate));

		scheduler.matchWaitingRequests();

		verify(expirationService).expireOverdue(matchedAt);
		verify(creationService).createMatch(
				1L,
				2L,
				matchedAt,
				deadline,
				earliestSessionStart
		);
	}

	private MatchRequest request(Long id) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getId()).thenReturn(id);
		return request;
	}
}
