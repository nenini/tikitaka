package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.policy.MatchScore;
import com.date.backend.domain.match.policy.MatchingPolicyProvider;
import com.date.backend.domain.match.policy.MatchingPolicySnapshot;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchJobProcessorPolicyTest {

	private static final LocalDateTime MATCHED_AT =
			LocalDateTime.of(2026, 7, 28, 10, 0);

	private final MatchJobRepository jobRepository = mock(MatchJobRepository.class);
	private final MatchCandidateService candidateService =
			mock(MatchCandidateService.class);
	private final MatchCreationService creationService =
			mock(MatchCreationService.class);
	private final MatchingPolicyProvider policyProvider = mock(MatchingPolicyProvider.class);
	private final MatchingPolicySnapshot policy = MatchingPolicySnapshot.defaults();
	private final Clock clock = Clock.fixed(
			Instant.parse("2026-07-28T01:00:00Z"),
			ZoneId.of("Asia/Seoul")
	);
	private final MatchJobProcessor processor = new MatchJobProcessor(
			jobRepository,
			candidateService,
			creationService,
			policyProvider,
			clock
	);

	@Test
	void earlierSlotDeadlineOverridesEightHourMaximum() {
		MatchJob job = ownedJob();
		when(policyProvider.current()).thenReturn(policy);
		MatchRequest candidateRequest = mock(MatchRequest.class);
		when(candidateRequest.getId()).thenReturn(2L);
		LocalDateTime proposedScheduledAt = MATCHED_AT.plusHours(3);
		when(candidateService.findBestCandidate(
				1L,
				MATCHED_AT.plusHours(2),
				MATCHED_AT,
				policy
		)).thenReturn(Optional.of(new MatchCandidate(
				candidateRequest,
				score(),
				proposedScheduledAt
		)));

		processor.process(100L, "worker-1");

		verify(creationService).createMatch(
				1L,
				2L,
				MATCHED_AT,
				MATCHED_AT.plusHours(2),
				proposedScheduledAt,
				policy
		);
	}

	@Test
	void eightHourMaximumOverridesLaterSlotDeadline() {
		MatchJob job = ownedJob();
		when(policyProvider.current()).thenReturn(policy);
		MatchRequest candidateRequest = mock(MatchRequest.class);
		when(candidateRequest.getId()).thenReturn(2L);
		LocalDateTime proposedScheduledAt = MATCHED_AT.plusHours(12);
		when(candidateService.findBestCandidate(
				1L,
				MATCHED_AT.plusHours(2),
				MATCHED_AT,
				policy
		)).thenReturn(Optional.of(new MatchCandidate(
				candidateRequest,
				score(),
				proposedScheduledAt
		)));

		processor.process(100L, "worker-1");

		verify(creationService).createMatch(
				1L,
				2L,
				MATCHED_AT,
				MATCHED_AT.plusHours(8),
				proposedScheduledAt,
				policy
		);
	}

	private MatchJob ownedJob() {
		MatchJob job = mock(MatchJob.class);
		MatchRequest sourceRequest = mock(MatchRequest.class);
		when(sourceRequest.getId()).thenReturn(1L);
		when(jobRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(job));
		when(job.isOwnedBy("worker-1")).thenReturn(true);
		when(job.getMatchRequest()).thenReturn(sourceRequest);
		return job;
	}

	private MatchScore score() {
		return new MatchScore(
				new BigDecimal("25.000"),
				new BigDecimal("25.000"),
				new BigDecimal("50.000")
		);
	}
}
