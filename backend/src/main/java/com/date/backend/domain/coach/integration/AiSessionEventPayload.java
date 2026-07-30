package com.date.backend.domain.coach.integration;

import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.event.AiSessionParticipantContext;
import com.date.backend.domain.room.event.AiSessionStartedEvent;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiSessionEventPayload(
		String eventId,
		String eventType,
		int version,
		String sessionId,
		Instant actualStartAt,
		Instant endedAt,
		List<AiSessionParticipantContext> participants,
		AiSessionStartedEvent.AiSessionFeatures features,
		AiSessionEndedEvent.AiSessionEndReason reason
) {
}
