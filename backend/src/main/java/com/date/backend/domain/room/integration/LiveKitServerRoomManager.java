package com.date.backend.domain.room.integration;

import com.date.backend.domain.room.config.LiveKitProperties;
import io.livekit.server.RoomServiceClient;

import java.io.IOException;

public class LiveKitServerRoomManager implements LiveKitRoomManager {
	private final RoomServiceClient client;
	private final LiveKitProperties properties;

	public LiveKitServerRoomManager(LiveKitProperties properties) {
		this.properties = properties;
		this.client = RoomServiceClient.createClient(
				properties.url(),
				properties.apiKey(),
				properties.apiSecret()
		);
	}

	@Override
	public void createRoom(String roomName) {
		try {
			var response = client.createRoom(
					roomName,
					properties.emptyTimeoutSeconds(),
					properties.maxParticipants()
			).execute();
			if (!response.isSuccessful()) {
				throw new IllegalStateException(
						"LiveKit room creation failed. status=" + response.code()
				);
			}
		} catch (IOException exception) {
			throw new IllegalStateException("LiveKit room creation failed.", exception);
		}
	}
}
