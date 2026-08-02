package com.date.backend.domain.room.event;

public record AiSessionParticipantContext(
		String userId,
		String participantIdentity,
		boolean sttEnabled,
		boolean visionEnabled
) {
}
