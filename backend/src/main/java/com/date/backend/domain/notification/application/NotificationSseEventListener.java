package com.date.backend.domain.notification.application;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class NotificationSseEventListener {

	private final NotificationSseService sseService;

	public NotificationSseEventListener(NotificationSseService sseService) {
		this.sseService = sseService;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleNotificationCreated(NotificationCreatedEvent event) {
		sseService.sendNotification(event.userId(), event.notification());
	}
}
