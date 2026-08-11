package com.date.backend.domain.room.event;

import java.util.List;

public record AiSessionParticipantContext(
		String userId,
		String participantIdentity,
		boolean sttEnabled,
		boolean visionEnabled,
		List<String> practiceGoals
) {
	public AiSessionParticipantContext {
		practiceGoals = practiceGoals == null ? List.of() : List.copyOf(practiceGoals);
	}

	public AiSessionParticipantContext(String userId, String participantIdentity,
			boolean sttEnabled, boolean visionEnabled) {
		this(userId, participantIdentity, sttEnabled, visionEnabled, List.of());
	}
}
