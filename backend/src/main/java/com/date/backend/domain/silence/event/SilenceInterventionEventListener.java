package com.date.backend.domain.silence.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SilenceInterventionEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public SilenceInterventionEventListener(SimpMessagingTemplate messagingTemplate) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(SilenceInterventionEvent event) {
		messagingTemplate.convertAndSend(
				"/topic/sessions/%d/silence".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
