package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;
import java.util.List;

public record SessionDetailResponse(
		Long sessionId,
		Long matchPairId,
		RoomSessionStatus status,
		LocalDateTime scheduledStartAt,
		LocalDateTime actualStartAt,
		LocalDateTime actualEndAt,
		int plannedDurationSec,
		long remainingSeconds,
		List<SessionParticipantResponse> participants
) {
}
