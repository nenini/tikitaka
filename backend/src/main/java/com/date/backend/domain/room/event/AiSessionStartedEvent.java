package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomParticipant;

import java.time.Instant;
import java.util.List;

public record AiSessionStartedEvent(
		String eventType,
		int version,
		String sessionType,
		String scenario,
		String sessionId,
		Instant actualStartAt,
		AiSessionLiveKitConnection liveKit,
		List<AiSessionParticipantContext> participants,
		AiSessionFeatures features
) {
	public static final String EVENT_TYPE = "AI_SESSION_STARTED";
	public static final int VERSION = 1;
	public static final String REAL_DATE = "REAL_DATE";
	public static final String AI_VIDEO = "AI_VIDEO";

	public static AiSessionStartedEvent of(
			Long sessionId,
			Instant actualStartAt,
			AiSessionLiveKitConnection liveKit,
			List<RoomParticipant> participants
	) {
		List<AiSessionParticipantContext> participantContexts =
				participants.stream()
						.map(participant -> new AiSessionParticipantContext(
								String.valueOf(participant.getUserId()),
								participant.getParticipantIdentity(),
								participant.isVoiceAnalysisEnabled(),
								participant.isExpressionAnalysisEnabled(),
								List.of()
					))
						.toList();
		return new AiSessionStartedEvent(
				EVENT_TYPE,
				VERSION,
				REAL_DATE,
				null,
				String.valueOf(sessionId),
				actualStartAt,
				liveKit,
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

	public static AiSessionStartedEvent aiVideo(
			Long sessionId,
			Instant actualStartAt,
			String scenario,
			AiSessionLiveKitConnection liveKit,
			AiSessionParticipantContext participant
	) {
		return new AiSessionStartedEvent(
				EVENT_TYPE,
				VERSION,
				AI_VIDEO,
				scenario,
				String.valueOf(sessionId),
				actualStartAt,
				liveKit,
				List.of(participant),
				new AiSessionFeatures(
						participant.sttEnabled(),
						participant.visionEnabled(),
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
