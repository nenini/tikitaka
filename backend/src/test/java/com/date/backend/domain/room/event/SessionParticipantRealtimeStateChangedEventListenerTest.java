package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.SessionNetworkQuality;
import com.date.backend.domain.room.dto.response.SessionParticipantRealtimeStateChangedResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionParticipantRealtimeStateChangedEventListenerTest {

	@Test
	void publishesCommittedRealtimeStateToSessionTopic() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		SessionParticipantRealtimeStateChangedEventListener listener =
				new SessionParticipantRealtimeStateChangedEventListener(
						messagingTemplate
				);
		LocalDateTime occurredAt =
				LocalDateTime.of(2026, 7, 29, 22, 0);
		SessionParticipantRealtimeStateChangedResponse payload =
				new SessionParticipantRealtimeStateChangedResponse(
						"PARTICIPANT_NETWORK_QUALITY_CHANGED",
						15L,
						101L,
						true,
						false,
						SessionNetworkQuality.GOOD,
						occurredAt.minusSeconds(1),
						occurredAt,
						occurredAt
				);

		listener.handle(
				new SessionParticipantRealtimeStateChangedEvent(payload)
		);

		verify(messagingTemplate).convertAndSend(
				"/topic/sessions/15/participants",
				payload
		);
	}
}
