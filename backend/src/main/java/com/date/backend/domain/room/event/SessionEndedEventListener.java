package com.date.backend.domain.room.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionEndedEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public SessionEndedEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(SessionEndedEvent event) {
		messagingTemplate.convertAndSend(
				"/topic/sessions/%d/lifecycle".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
