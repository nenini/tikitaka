package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionConnectionStatus;

import java.time.LocalDateTime;

public record SessionParticipantStateResponse(
		Long userId,
		boolean joined,
		boolean ready,
		LocalDateTime joinedAt,
		SessionConnectionStatus connectionStatus,
		LocalDateTime connectedAt,
		LocalDateTime disconnectedAt
) {
}
