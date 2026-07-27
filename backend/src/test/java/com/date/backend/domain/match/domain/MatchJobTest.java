package com.date.backend.domain.match.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class MatchJobTest {

	@Test
	void transitionsFromPendingToProcessingAndCompleted() {
		LocalDateTime availableAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		MatchJob job = new MatchJob(mock(MatchRequest.class), availableAt);

		job.claim("worker-1", availableAt.plusSeconds(1));
		job.complete(availableAt.plusSeconds(2));

		assertThat(job.getStatus()).isEqualTo(MatchJobStatus.COMPLETED);
		assertThat(job.getAttemptCount()).isEqualTo(1);
		assertThat(job.getWorkerId()).isEqualTo("worker-1");
		assertThat(job.getCompletedAt()).isEqualTo(availableAt.plusSeconds(2));
	}

	@Test
	void onlyPendingJobCanBeClaimed() {
		LocalDateTime now = LocalDateTime.of(2026, 7, 27, 10, 0);
		MatchJob job = new MatchJob(mock(MatchRequest.class), now);
		job.claim("worker-1", now);

		assertThatThrownBy(() -> job.claim("worker-2", now.plusSeconds(1)))
				.isInstanceOf(IllegalStateException.class);
	}
}
