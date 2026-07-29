package com.date.backend.domain.silence.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SilenceInterventionStageTest {

	@Test
	void resolvesStageFromSilenceDuration() {
		assertThat(SilenceInterventionStage.fromDuration(10_000))
				.isEqualTo(SilenceInterventionStage.NONE);
		assertThat(SilenceInterventionStage.fromDuration(15_000))
				.isEqualTo(SilenceInterventionStage.TOPIC_HINT);
		assertThat(SilenceInterventionStage.fromDuration(30_000))
				.isEqualTo(SilenceInterventionStage.QUESTION_CARD);
		assertThat(SilenceInterventionStage.fromDuration(45_000))
				.isEqualTo(SilenceInterventionStage.CONTEXTUAL_QUESTIONS);
	}
}
