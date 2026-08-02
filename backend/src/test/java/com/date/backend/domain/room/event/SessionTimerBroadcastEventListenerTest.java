package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionTimerEventType;
import com.date.backend.domain.room.dto.response.SessionTimerEventResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionTimerBroadcastEventListenerTest {

	@Test
	void publishesCommittedTimerEventToSessionTimerTopic() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		SessionTimerBroadcastEventListener listener =
				new SessionTimerBroadcastEventListener(messagingTemplate);
		LocalDateTime now = LocalDateTime.of(2026, 7, 29, 22, 0);
		SessionTimerEventResponse payload = new SessionTimerEventResponse(
				SessionTimerEventType.SESSION_ENDING_SOON,
				15L,
				300,
				now.plusMinutes(5),
				now
		);

		listener.handle(new SessionTimerBroadcastEvent(payload));

		verify(messagingTemplate).convertAndSend(
				"/topic/sessions/15/timer",
				payload
		);
	}
}
