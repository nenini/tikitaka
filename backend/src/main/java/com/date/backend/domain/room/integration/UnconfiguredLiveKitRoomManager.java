package com.date.backend.domain.room.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UnconfiguredLiveKitRoomManager implements LiveKitRoomManager {
	private static final Logger log = LoggerFactory.getLogger(UnconfiguredLiveKitRoomManager.class);

	@Override
	public void createRoom(String roomName) {
		log.info("LiveKit is not configured; physical room creation skipped. roomName={}", roomName);
	}
}
