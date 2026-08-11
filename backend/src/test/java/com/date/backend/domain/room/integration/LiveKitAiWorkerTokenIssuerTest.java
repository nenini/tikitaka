package com.date.backend.domain.room.integration;

import com.auth0.jwt.JWT;
import com.date.backend.domain.room.config.LiveKitProperties;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LiveKitAiWorkerTokenIssuerTest {

	@Test
	void issuesRoomScopedSubscribeOnlyTokenForHumanSessionAnalysis() {
		LiveKitAiWorkerTokenIssuer issuer = new LiveKitAiWorkerTokenIssuer(
				new LiveKitProperties(
						"wss://date-project.livekit.cloud",
						"api-key",
						"api-secret-api-secret-api-secret",
						600,
						3
				)
		);

		var issued = issuer.issue(15L, "date-room-30");
		var decoded = JWT.decode(issued.accessToken());
		Map<String, Object> video = decoded.getClaim("video").asMap();

		assertThat(issued.configured()).isTrue();
		assertThat(issued.url())
				.isEqualTo("wss://date-project.livekit.cloud");
		assertThat(issued.roomName()).isEqualTo("date-room-30");
		assertThat(issued.participantIdentity()).isEqualTo("ai-session-15");
		assertThat(decoded.getSubject()).isEqualTo("ai-session-15");
		assertThat(video)
				.containsEntry("roomJoin", true)
				.containsEntry("room", "date-room-30")
				.containsEntry("canPublish", false)
				.containsEntry("canSubscribe", true);
	}

	@Test
	void issuesPublishAndSubscribeTokenForAiConversation() {
		LiveKitAiWorkerTokenIssuer issuer = new LiveKitAiWorkerTokenIssuer(
				new LiveKitProperties(
						"wss://date-project.livekit.cloud",
						"api-key",
						"api-secret-api-secret-api-secret",
						600,
						3
				)
		);

		var issued = issuer.issueConversationalWorker(15L, "ai-video-room-15");
		Map<String, Object> video = JWT.decode(issued.accessToken()).getClaim("video").asMap();

		assertThat(video)
				.containsEntry("roomJoin", true)
				.containsEntry("room", "ai-video-room-15")
				.containsEntry("canPublish", true)
				.containsEntry("canSubscribe", true);
	}

	@Test
	void remainsUnconfiguredWithoutLiveKitCredentials() {
		LiveKitAiWorkerTokenIssuer issuer = new LiveKitAiWorkerTokenIssuer(
				new LiveKitProperties("", "", "", 600, 3)
		);

		var issued = issuer.issue(15L, "date-room-30");

		assertThat(issued.configured()).isFalse();
		assertThat(issued.accessToken()).isNull();
	}
}
