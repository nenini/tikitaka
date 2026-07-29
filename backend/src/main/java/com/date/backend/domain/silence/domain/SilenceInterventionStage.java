package com.date.backend.domain.silence.domain;

public enum SilenceInterventionStage {
	NONE,
	TOPIC_HINT,
	QUESTION_CARD,
	CONTEXTUAL_QUESTIONS;

	public static SilenceInterventionStage fromDuration(long durationMs) {
		if (durationMs >= 45_000) {
			return CONTEXTUAL_QUESTIONS;
		}
		if (durationMs >= 30_000) {
			return QUESTION_CARD;
		}
		if (durationMs >= 15_000) {
			return TOPIC_HINT;
		}
		return NONE;
	}
}
