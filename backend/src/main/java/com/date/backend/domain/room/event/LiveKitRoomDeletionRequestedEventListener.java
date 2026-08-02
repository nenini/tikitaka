package com.date.backend.domain.room.event;

import com.date.backend.domain.room.integration.LiveKitRoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class LiveKitRoomDeletionRequestedEventListener {
	private static final Logger log = LoggerFactory.getLogger(
			LiveKitRoomDeletionRequestedEventListener.class
	);

	private final LiveKitRoomManager liveKitRoomManager;

	public LiveKitRoomDeletionRequestedEventListener(
			LiveKitRoomManager liveKitRoomManager
	) {
		this.liveKitRoomManager = liveKitRoomManager;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(LiveKitRoomDeletionRequestedEvent event) {
		try {
			liveKitRoomManager.deleteRoom(event.roomName());
		} catch (RuntimeException exception) {
			log.error(
					"LiveKit Room cleanup failed after session termination. "
							+ "sessionId={}, roomName={}",
					event.sessionId(),
					event.roomName(),
					exception
			);
		}
	}
}
