package com.date.backend.domain.room.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class RoomParticipantStatusChangedEventListener {
	private final SimpMessagingTemplate messagingTemplate;

	public RoomParticipantStatusChangedEventListener(
			SimpMessagingTemplate messagingTemplate
	) {
		this.messagingTemplate = messagingTemplate;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(RoomParticipantStatusChangedEvent event) {
		Long roomId = event.payload().roomId();
		messagingTemplate.convertAndSend(
				"/topic/rooms/" + roomId + "/participants",
				event.payload()
		);
	}
}
