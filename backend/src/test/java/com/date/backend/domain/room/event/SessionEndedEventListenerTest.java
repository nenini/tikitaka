package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.dto.response.SessionEndedResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionEndedEventListenerTest {

	@Test
	void publishesCommittedTerminationToLifecycleTopic() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		SessionEndedEventListener listener =
				new SessionEndedEventListener(messagingTemplate);
		SessionEndedResponse payload = new SessionEndedResponse(
				SessionEndedResponse.SESSION_ENDED,
				15L,
				RoomSessionStatus.CANCELLED,
				SessionTerminationReason.RECONNECT_TIMEOUT,
				LocalDateTime.of(2026, 7, 29, 22, 3)
		);

		listener.handle(new SessionEndedEvent(payload));

		verify(messagingTemplate).convertAndSend(
				"/topic/sessions/15/lifecycle",
				payload
		);
	}
}
