package com.date.backend.domain.room.application;

public record WaitingRoomCreatedEvent(
		Long roomId,
		String liveKitRoomName
) {
}
