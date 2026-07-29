package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomParticipant;

import java.time.Instant;
import java.util.List;

public record AiSessionStartedEvent(
		String eventType,
		int version,
		String sessionId,
		Instant actualStartAt,
		List<AiSessionParticipantContext> participants,
		AiSessionFeatures features
) {
	public static final String EVENT_TYPE = "AI_SESSION_STARTED";
	public static final int VERSION = 1;

	public static AiSessionStartedEvent of(
			Long sessionId,
			Instant actualStartAt,
			List<RoomParticipant> participants
	) {
		List<AiSessionParticipantContext> participantContexts =
				participants.stream()
						.map(participant -> new AiSessionParticipantContext(
								String.valueOf(participant.getUserId()),
								participant.getParticipantIdentity(),
								participant.isVoiceAnalysisEnabled(),
								participant.isExpressionAnalysisEnabled()
						))
						.toList();
		return new AiSessionStartedEvent(
				EVENT_TYPE,
				VERSION,
				String.valueOf(sessionId),
				actualStartAt,
				List.copyOf(participantContexts),
				new AiSessionFeatures(
						participantContexts.stream()
								.anyMatch(AiSessionParticipantContext::sttEnabled),
						participantContexts.stream()
								.anyMatch(AiSessionParticipantContext::visionEnabled),
						true
				)
		);
	}

	public record AiSessionFeatures(
			boolean sttEnabled,
			boolean visionEnabled,
			boolean coachingEnabled
	) {
	}
}
