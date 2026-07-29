package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomEntryStatus;
import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;
import java.util.List;

public record WaitingRoomDetailResponse(
		Long roomId,
		Long matchPairId,
		RoomSessionStatus status,
		LocalDateTime scheduledAt,
		LocalDateTime enterableFrom,
		LocalDateTime enterableUntil,
		boolean canEnter,
		RoomEntryStatus entryStatus,
		List<RoomParticipantSummaryResponse> participants
) {
}
