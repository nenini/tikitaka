package com.date.backend.domain.result.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PeerEvaluationTest {
	@Test
	void createsEvaluationAndTrimsOptionalText() {
		PeerEvaluation evaluation = evaluation(1, 5, "  배려가 좋아요.  ");

		assertThat(evaluation.getComfortScore()).isEqualTo(1);
		assertThat(evaluation.getMannerScore()).isEqualTo(5);
		assertThat(evaluation.getGoodBehaviorText()).isEqualTo("배려가 좋아요.");
	}

	@Test
	void rejectsOutOfRangeScoreAndSelfEvaluation() {
		assertThatThrownBy(() -> evaluation(0, 5, null))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new PeerEvaluation(
				1L, 10L, 10L, 3, 3, 3, 3, 3, 3,
				null, null, LocalDateTime.now()
		)).isInstanceOf(IllegalArgumentException.class);
	}

	private PeerEvaluation evaluation(int comfort, int manner, String goodText) {
		return new PeerEvaluation(
				1L, 10L, 20L, comfort, 3, 3, 3, 3, manner,
				goodText, " ", LocalDateTime.of(2026, 7, 30, 12, 0)
		);
	}
}
