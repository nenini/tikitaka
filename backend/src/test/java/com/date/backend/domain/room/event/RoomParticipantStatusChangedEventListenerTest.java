package com.date.backend.domain.room.event;

import com.date.backend.domain.room.dto.response.RoomParticipantStatusChangedResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RoomParticipantStatusChangedEventListenerTest {

	@Test
	void publishesCommittedChangeToRoomParticipantTopic() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		RoomParticipantStatusChangedEventListener listener =
				new RoomParticipantStatusChangedEventListener(messagingTemplate);
		RoomParticipantStatusChangedResponse payload =
				new RoomParticipantStatusChangedResponse(
						"PARTICIPANT_READY_CHANGED",
						15L,
						101L,
						true,
						false,
						List.of(),
						LocalDateTime.of(2026, 7, 29, 11, 0)
				);

		listener.handle(new RoomParticipantStatusChangedEvent(payload));

		verify(messagingTemplate).convertAndSend(
				"/topic/rooms/15/participants",
				payload
		);
	}
}
