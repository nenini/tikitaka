package com.date.backend.domain.safety.domain;

public enum SafetySeverity {
	LOW(1),
	MEDIUM(3),
	HIGH(5);

	private final int mannerPenaltyScore;

	SafetySeverity(int mannerPenaltyScore) {
		this.mannerPenaltyScore = mannerPenaltyScore;
	}

	public int mannerPenaltyScore() {
		return mannerPenaltyScore;
	}

	public SafetySeverity escalate() {
		return switch (this) {
			case LOW -> MEDIUM;
			case MEDIUM, HIGH -> HIGH;
		};
	}

	public static SafetySeverity effective(
			SafetySeverity detectedSeverity,
			long occurrenceCount
	) {
		if (occurrenceCount >= 5) {
			return HIGH;
		}
		if (occurrenceCount >= 3) {
			return detectedSeverity.escalate();
		}
		return detectedSeverity;
	}
}
