package com.date.backend.domain.room.event;

import com.date.backend.domain.room.integration.LiveKitAiWorkerTokenIssuer;

public record AiSessionLiveKitConnection(
		String url,
		String roomName,
		String accessToken,
		String participantIdentity
) {
	public static AiSessionLiveKitConnection from(
			LiveKitAiWorkerTokenIssuer.IssuedAiWorkerToken token
	) {
		if (!token.configured()) {
			return null;
		}
		return new AiSessionLiveKitConnection(
				token.url(),
				token.roomName(),
				token.accessToken(),
				token.participantIdentity()
		);
	}
}
