package com.date.backend.domain.room.config;

import com.date.backend.domain.room.integration.LiveKitServerRoomManager;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class LiveKitPropertiesTest {

	@Test
	void convertsLiveKitWebSocketUrlToServerApiUrl() {
		LiveKitProperties cloud = new LiveKitProperties(
				"wss://date-project.livekit.cloud",
				"key",
				"secret",
				600,
				2
		);
		LiveKitProperties local = new LiveKitProperties(
				"ws://localhost:7880",
				"key",
				"secret",
				600,
				2
		);

		assertThat(cloud.url()).isEqualTo("https://date-project.livekit.cloud");
		assertThat(local.url()).isEqualTo("http://localhost:7880");
		assertThat(cloud.clientUrl())
				.isEqualTo("wss://date-project.livekit.cloud");
		assertThat(local.clientUrl()).isEqualTo("ws://localhost:7880");
		assertThat(cloud.configured()).isTrue();
		assertThatCode(() -> new LiveKitServerRoomManager(cloud))
				.doesNotThrowAnyException();
	}

	@Test
	void defaultsMaximumParticipantsToThreeForAiWorker() {
		LiveKitProperties properties = new LiveKitProperties(
				"",
				"",
				"",
				0,
				0
		);

		assertThat(properties.maxParticipants()).isEqualTo(3);
	}
}
