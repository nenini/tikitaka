package com.date.backend.domain.room.config;

import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.integration.LiveKitServerRoomManager;
import com.date.backend.domain.room.integration.UnconfiguredLiveKitRoomManager;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({RoomEntryProperties.class, LiveKitProperties.class})
public class RoomConfig {

	@Bean
	LiveKitRoomManager liveKitRoomManager(LiveKitProperties properties) {
		if (!properties.configured()) {
			return new UnconfiguredLiveKitRoomManager();
		}
		return new LiveKitServerRoomManager(properties);
	}
}
