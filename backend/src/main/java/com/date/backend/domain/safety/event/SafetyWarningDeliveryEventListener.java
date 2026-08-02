package com.date.backend.domain.safety.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SafetyWarningDeliveryEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public SafetyWarningDeliveryEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(SafetyWarningDeliveryEvent event) {
		messagingTemplate.convertAndSendToUser(
				String.valueOf(event.targetUserId()),
				"/queue/sessions/%d/safety".formatted(
						event.payload().sessionId()
				),
				event.payload()
		);
	}
}
