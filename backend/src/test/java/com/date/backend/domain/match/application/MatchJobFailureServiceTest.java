package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.policy.MatchJobRetryPolicy;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchJobFailureServiceTest {

	private final MatchJobRepository jobRepository = mock(MatchJobRepository.class);
	private final MatchJobRetryPolicy retryPolicy = mock(MatchJobRetryPolicy.class);
	private final MatchJobFailureService service = new MatchJobFailureService(
			jobRepository,
			retryPolicy
	);

	@Test
	void reschedulesFailureWhenRetryIsAvailable() {
		MatchJob job = mock(MatchJob.class);
		LocalDateTime failedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime availableAt = failedAt.plusSeconds(5);
		when(jobRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(job));
		when(job.isOwnedBy("worker-1")).thenReturn(true);
		when(job.getAttemptCount()).thenReturn(1);
		when(retryPolicy.canRetry(1)).thenReturn(true);
		when(retryPolicy.nextAvailableAt(1, failedAt)).thenReturn(availableAt);

		service.fail(1L, "worker-1", "일시 오류", failedAt);

		verify(job).reschedule("일시 오류", availableAt);
		verify(job, never()).fail("일시 오류", failedAt);
	}

	@Test
	void marksFinalFailureWhenAttemptsAreExhausted() {
		MatchJob job = mock(MatchJob.class);
		LocalDateTime failedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		when(jobRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(job));
		when(job.isOwnedBy("worker-1")).thenReturn(true);
		when(job.getAttemptCount()).thenReturn(3);
		when(retryPolicy.canRetry(3)).thenReturn(false);

		service.fail(1L, "worker-1", "최종 오류", failedAt);

		verify(job).fail("최종 오류", failedAt);
		verify(job, never()).reschedule(
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.any()
		);
	}
}
