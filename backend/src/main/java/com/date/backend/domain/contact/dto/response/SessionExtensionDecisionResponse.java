package com.date.backend.domain.contact.dto.response;

import com.date.backend.domain.contact.domain.ContactDecision;
import com.date.backend.domain.contact.domain.ContactDecisionStatus;
import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;

public record SessionExtensionDecisionResponse(
		String eventType,
		Long sessionId,
		ContactDecisionStatus status,
		Long requesterUserId,
		ContactDecision requesterDecision,
		Long targetUserId,
		ContactDecision targetDecision,
		RoomSessionStatus sessionStatus,
		LocalDateTime scheduledEndAt,
		LocalDateTime actualEndAt,
		LocalDateTime occurredAt
) {
	public static final String EVENT_TYPE =
			"SESSION_EXTENSION_DECISION_CHANGED";
}
