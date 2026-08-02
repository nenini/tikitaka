package com.date.backend.domain.room.integration;

import com.auth0.jwt.JWT;
import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveKitParticipantTokenIssuerTest {

	private final LiveKitParticipantTokenIssuer issuer =
			new LiveKitParticipantTokenIssuer(new LiveKitProperties(
					"wss://demo.livekit.cloud",
					"demo-api-key",
					"demo-api-secret-at-least-32-characters",
					600,
					2
			));

	@Test
	void configuredIssuerCreatesParticipantToken() {
		var token = issuer.issue(2L, "date-room-1");

		assertThat(token.configured()).isTrue();
		assertThat(token.url()).isEqualTo("https://demo.livekit.cloud");
		assertThat(token.accessToken()).isNotBlank();

		var decoded = JWT.decode(token.accessToken());
		Map<String, Object> video = decoded.getClaim("video").asMap();
		assertThat(decoded.getSubject()).isEqualTo("user-2");
		assertThat(video)
				.containsEntry("roomJoin", true)
				.containsEntry("room", "date-room-1")
				.containsEntry("canPublish", true)
				.containsEntry("canSubscribe", true)
				.containsEntry("canPublishData", true);
	}

	@Test
	void missingRoomNameReturnsServiceUnavailableBusinessError() {
		assertThatThrownBy(() -> issuer.issue(2L, null))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode
										.SESSION_LIVEKIT_ROOM_NOT_CONFIGURED
						)
				);
	}
}
