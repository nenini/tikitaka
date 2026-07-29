package com.date.backend.domain.room.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UnconfiguredLiveKitRoomManager implements LiveKitRoomManager {
	private static final Logger log = LoggerFactory.getLogger(UnconfiguredLiveKitRoomManager.class);

	@Override
	public void createRoom(String roomName) {
		log.info("LiveKit is not configured; physical room creation skipped. roomName={}", roomName);
	}

	@Override
	public void deleteRoom(String roomName) {
		throw new IllegalStateException(
				"LiveKit 설정이 없어 Room을 종료할 수 없습니다. roomName="
						+ roomName
		);
	}
}
