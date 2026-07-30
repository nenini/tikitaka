package com.date.backend.domain.room.integration;

import com.date.backend.domain.room.config.LiveKitProperties;
import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.stereotype.Component;

@Component
public class LiveKitAiWorkerTokenIssuer {
	private static final long TOKEN_TTL_SECONDS = 3_600;
	private static final String IDENTITY_PREFIX = "ai-session-";

	private final LiveKitProperties properties;

	public LiveKitAiWorkerTokenIssuer(LiveKitProperties properties) {
		this.properties = properties;
	}

	public IssuedAiWorkerToken issue(Long sessionId, String roomName) {
		if (!properties.configured()) {
			return new IssuedAiWorkerToken(
					false,
					null,
					roomName,
					null,
					null
			);
		}
		String identity = IDENTITY_PREFIX + sessionId;
		AccessToken token = new AccessToken(
				properties.apiKey(),
				properties.apiSecret()
		);
		token.setIdentity(identity);
		token.setName(identity);
		token.setTtl(TOKEN_TTL_SECONDS);
		token.addGrants(
				new RoomJoin(true),
				new RoomName(roomName),
				new CanPublish(false),
				new CanSubscribe(true)
		);
		return new IssuedAiWorkerToken(
				true,
				properties.clientUrl(),
				roomName,
				identity,
				token.toJwt()
		);
	}

	public record IssuedAiWorkerToken(
			boolean configured,
			String url,
			String roomName,
			String participantIdentity,
			String accessToken
	) {
	}
}
