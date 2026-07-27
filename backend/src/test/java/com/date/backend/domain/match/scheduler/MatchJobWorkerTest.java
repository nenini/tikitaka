package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.ClaimedMatchJob;
import com.date.backend.domain.match.application.MatchJobClaimService;
import com.date.backend.domain.match.application.MatchJobFailureService;
import com.date.backend.domain.match.application.MatchJobProcessor;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchJobWorkerTest {

	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 27, 10, 0);

	private final MatchJobClaimService claimService = mock(MatchJobClaimService.class);
	private final MatchJobProcessor processor = mock(MatchJobProcessor.class);
	private final MatchJobFailureService failureService =
			mock(MatchJobFailureService.class);
	private final Clock clock = Clock.fixed(
			Instant.parse("2026-07-27T01:00:00Z"),
			ZoneId.of("Asia/Seoul")
	);
	private final MatchJobWorker worker = new MatchJobWorker(
			claimService,
			processor,
			failureService,
			clock
	);

	@Test
	void processesClaimedJobs() {
		when(claimService.claim(anyString(), eq(NOW)))
				.thenReturn(List.of(new ClaimedMatchJob(1L, 11L)));

		worker.processJobs();

		verify(processor).process(eq(1L), anyString());
	}

	@Test
	void recordsFailureWhenProcessingThrows() {
		when(claimService.claim(anyString(), eq(NOW)))
				.thenReturn(List.of(new ClaimedMatchJob(1L, 11L)));
		doThrow(new IllegalStateException("처리 실패"))
				.when(processor)
				.process(eq(1L), anyString());

		worker.processJobs();

		verify(failureService).fail(
				eq(1L),
				anyString(),
				eq("처리 실패"),
				eq(NOW)
		);
	}
}
