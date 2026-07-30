package com.date.backend.domain.room.integration;

import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.stereotype.Component;

@Component
public class LiveKitParticipantTokenIssuer {
	private static final long TOKEN_TTL_SECONDS = 3_600;

	private final LiveKitProperties properties;

	public LiveKitParticipantTokenIssuer(LiveKitProperties properties) {
		this.properties = properties;
	}

	public IssuedLiveKitToken issue(Long userId, String roomName) {
		if (!properties.configured()) {
			return new IssuedLiveKitToken(false, null, null);
		}
		if (roomName == null || roomName.isBlank()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_LIVEKIT_ROOM_NOT_CONFIGURED
			);
		}
		AccessToken token = new AccessToken(
				properties.apiKey(),
				properties.apiSecret()
		);
		token.setIdentity("user-" + userId);
		token.setName("user-" + userId);
		token.setTtl(TOKEN_TTL_SECONDS);
		token.addGrants(
				new RoomJoin(true),
				new RoomName(roomName),
				new CanPublish(true),
				new CanSubscribe(true)
		);
		return new IssuedLiveKitToken(true, properties.url(), token.toJwt());
	}

	public record IssuedLiveKitToken(
			boolean configured,
			String url,
			String accessToken
	) {
	}
}
