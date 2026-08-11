package com.date.backend.domain.room.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionParticipantConnectionChangedEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public SessionParticipantConnectionChangedEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(SessionParticipantConnectionChangedEvent event) {
		messagingTemplate.convertAndSend(
				"/topic/sessions/%d/participants".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
