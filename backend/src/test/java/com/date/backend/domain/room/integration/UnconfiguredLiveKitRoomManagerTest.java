package com.date.backend.domain.room.integration;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UnconfiguredLiveKitRoomManagerTest {

	@Test
	void deletionWithoutLiveKitConfigurationIsRejected() {
		UnconfiguredLiveKitRoomManager manager =
				new UnconfiguredLiveKitRoomManager();

		assertThatThrownBy(() -> manager.deleteRoom("date-room-30"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("LiveKit 설정");
	}
}
