package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;

public record SessionJoinResponse(
		Long sessionId,
		RoomSessionStatus status,
		Long userId,
		LocalDateTime joinedAt,
		boolean alreadyJoined,
		boolean liveKitConfigured,
		String liveKitUrl,
		String liveKitAccessToken
) {
}
