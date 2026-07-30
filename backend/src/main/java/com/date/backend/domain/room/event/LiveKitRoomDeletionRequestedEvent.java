package com.date.backend.domain.room.event;

public record LiveKitRoomDeletionRequestedEvent(
		Long sessionId,
		String roomName
) {
}
