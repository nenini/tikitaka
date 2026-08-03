package com.date.backend.domain.contact.event;

import com.date.backend.domain.contact.domain.ContactDecision;
import com.date.backend.domain.contact.domain.ContactDecisionStatus;
import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionExtensionDecisionChangedEventListenerTest {

	@Test
	void publishesDecisionToBothSessionParticipants() {
		SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
		SessionExtensionDecisionChangedEventListener listener =
				new SessionExtensionDecisionChangedEventListener(template);
		LocalDateTime now = LocalDateTime.of(2026, 7, 31, 20, 31);
		SessionExtensionDecisionResponse payload =
				new SessionExtensionDecisionResponse(
						SessionExtensionDecisionResponse.EVENT_TYPE,
						15L,
						ContactDecisionStatus.PENDING,
						1L,
						ContactDecision.AGREE,
						2L,
						null,
						RoomSessionStatus.IN_PROGRESS,
						LocalDateTime.of(2026, 7, 31, 20, 35),
						null,
						now
				);

		listener.handle(new SessionExtensionDecisionChangedEvent(payload));

		verify(template).convertAndSend(
				"/topic/sessions/15/extensions",
				payload
		);
	}
}
