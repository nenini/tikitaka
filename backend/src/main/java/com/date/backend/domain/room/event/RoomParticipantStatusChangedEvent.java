package com.date.backend.domain.room.event;

import com.date.backend.domain.room.dto.response.RoomParticipantStatusChangedResponse;

public record RoomParticipantStatusChangedEvent(
		RoomParticipantStatusChangedResponse payload
) {
}
