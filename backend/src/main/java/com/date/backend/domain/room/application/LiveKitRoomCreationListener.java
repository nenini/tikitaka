package com.date.backend.domain.room.application;

import com.date.backend.domain.room.integration.LiveKitRoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class LiveKitRoomCreationListener {
	private static final Logger log = LoggerFactory.getLogger(LiveKitRoomCreationListener.class);
	private final LiveKitRoomManager roomManager;

	public LiveKitRoomCreationListener(LiveKitRoomManager roomManager) {
		this.roomManager = roomManager;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void createLiveKitRoom(WaitingRoomCreatedEvent event) {
		try {
			roomManager.createRoom(event.liveKitRoomName());
		} catch (RuntimeException exception) {
			log.error(
					"LiveKit room creation failed after waiting room commit. roomId={}",
					event.roomId(),
					exception
			);
		}
	}
}
