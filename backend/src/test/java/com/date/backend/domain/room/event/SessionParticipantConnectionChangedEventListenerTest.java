package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.SessionNetworkQuality;
import com.date.backend.domain.room.dto.response.SessionParticipantConnectionChangedResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionParticipantConnectionChangedEventListenerTest {

	@Test
	void publishesCommittedConnectionChangeToSessionTopic() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		SessionParticipantConnectionChangedEventListener listener =
				new SessionParticipantConnectionChangedEventListener(
						messagingTemplate
				);
		SessionParticipantConnectionChangedResponse payload =
				new SessionParticipantConnectionChangedResponse(
						"PARTICIPANT_RECONNECTING",
						15L,
						101L,
						SessionConnectionStatus.RECONNECTING,
						LocalDateTime.of(2026, 7, 29, 21, 0),
						null,
						LocalDateTime.of(2026, 7, 29, 21, 1),
						LocalDateTime.of(2026, 7, 29, 21, 1, 20),
						null,
						1,
						false,
						false,
						SessionNetworkQuality.LOST,
						LocalDateTime.of(2026, 7, 29, 21, 1),
						LocalDateTime.of(2026, 7, 29, 21, 1),
						LocalDateTime.of(2026, 7, 29, 21, 1)
				);

		listener.handle(new SessionParticipantConnectionChangedEvent(payload));

		verify(messagingTemplate).convertAndSend(
				"/topic/sessions/15/participants",
				payload
		);
	}
}
