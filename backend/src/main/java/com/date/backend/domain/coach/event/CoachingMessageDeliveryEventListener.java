package com.date.backend.domain.coach.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CoachingMessageDeliveryEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public CoachingMessageDeliveryEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(CoachingMessageDeliveryEvent event) {
		messagingTemplate.convertAndSendToUser(
				String.valueOf(event.targetUserId()),
				"/queue/sessions/%d/coaching".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
