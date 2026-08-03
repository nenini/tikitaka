package com.date.backend.domain.contact.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionExtensionDecisionChangedEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public SessionExtensionDecisionChangedEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(SessionExtensionDecisionChangedEvent event) {
		messagingTemplate.convertAndSend(
				"/topic/sessions/%d/extensions".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
