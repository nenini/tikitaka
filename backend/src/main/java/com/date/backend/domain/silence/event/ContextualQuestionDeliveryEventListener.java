package com.date.backend.domain.silence.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ContextualQuestionDeliveryEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public ContextualQuestionDeliveryEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(ContextualQuestionDeliveryEvent event) {
		messagingTemplate.convertAndSendToUser(
				String.valueOf(event.targetUserId()),
				"/queue/sessions/%d/questions".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
