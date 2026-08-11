package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchWorkerProperties;
import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.policy.MatchJobRetryPolicy;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchJobRecoveryServiceTest {

	@Test
	void reschedulesStaleProcessingJob() {
		MatchJobRepository jobRepository = mock(MatchJobRepository.class);
		MatchJobRetryPolicy retryPolicy = mock(MatchJobRetryPolicy.class);
		MatchWorkerProperties properties = new MatchWorkerProperties(
				1_000,
				10_000,
				20,
				3,
				5,
				300,
				60
		);
		MatchJobRecoveryService service = new MatchJobRecoveryService(
				jobRepository,
				retryPolicy,
				properties
		);
		MatchJob staleJob = mock(MatchJob.class);
		LocalDateTime now = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime nextAvailableAt = now.plusSeconds(5);
		when(jobRepository.findStaleProcessingForUpdate(
				MatchJobStatus.PROCESSING,
				now.minusSeconds(60),
				PageRequest.of(0, 20)
		)).thenReturn(List.of(staleJob));
		when(staleJob.getAttemptCount()).thenReturn(1);
		when(retryPolicy.canRetry(1)).thenReturn(true);
		when(retryPolicy.nextAvailableAt(1, now)).thenReturn(nextAvailableAt);

		service.recoverStale(now);

		verify(staleJob).reschedule(
				"Worker 처리 제한 시간을 초과하여 작업을 복구했습니다.",
				nextAvailableAt
		);
	}
}
