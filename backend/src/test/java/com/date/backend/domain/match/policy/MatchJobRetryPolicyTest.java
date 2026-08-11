package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.config.MatchWorkerProperties;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class MatchJobRetryPolicyTest {

	private final MatchJobRetryPolicy policy = new MatchJobRetryPolicy(
			new MatchWorkerProperties(
					1_000,
					10_000,
					20,
					3,
					5,
					20,
					60
			)
	);

	@Test
	void calculatesCappedExponentialBackoff() {
		LocalDateTime failedAt = LocalDateTime.of(2026, 7, 27, 10, 0);

		assertThat(policy.nextAvailableAt(1, failedAt))
				.isEqualTo(failedAt.plusSeconds(5));
		assertThat(policy.nextAvailableAt(2, failedAt))
				.isEqualTo(failedAt.plusSeconds(10));
		assertThat(policy.nextAvailableAt(3, failedAt))
				.isEqualTo(failedAt.plusSeconds(20));
		assertThat(policy.nextAvailableAt(4, failedAt))
				.isEqualTo(failedAt.plusSeconds(20));
	}

	@Test
	void allowsRetryOnlyBeforeMaximumAttemptCount() {
		assertThat(policy.canRetry(1)).isTrue();
		assertThat(policy.canRetry(2)).isTrue();
		assertThat(policy.canRetry(3)).isFalse();
	}
}
