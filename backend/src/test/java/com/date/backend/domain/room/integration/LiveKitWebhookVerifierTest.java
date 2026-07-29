package com.date.backend.domain.room.integration;

import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import io.livekit.server.AccessToken;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveKitWebhookVerifierTest {
	private static final String API_KEY = "test-key";
	private static final String API_SECRET =
			"test-secret-with-at-least-thirty-two-characters";

	private final LiveKitWebhookVerifier verifier = new LiveKitWebhookVerifier(
			new LiveKitProperties(
					"https://livekit.example",
					API_KEY,
					API_SECRET,
					600,
					2
			)
	);

	@Test
	void verifiesSignatureAndParsesWebhookBody() throws Exception {
		String body = """
				{
				  "event": "participant_joined",
				  "id": "EV_test",
				  "createdAt": 1785332400
				}
				""";

		var event = verifier.verify(body, signedToken(body));

		assertThat(event.getEvent()).isEqualTo("participant_joined");
		assertThat(event.getId()).isEqualTo("EV_test");
	}

	@Test
	void rejectsMissingAuthorizationHeader() {
		assertUnauthorized(() -> verifier.verify("{}", null));
	}

	@Test
	void rejectsTokenWhoseBodyDigestDoesNotMatch() throws Exception {
		String signedBody = """
				{"event":"participant_joined","id":"EV_test"}
				""";

		assertUnauthorized(() -> verifier.verify(
				"{\"event\":\"participant_left\",\"id\":\"EV_test\"}",
				signedToken(signedBody)
		));
	}

	private String signedToken(String body) throws Exception {
		MessageDigest digest = MessageDigest.getInstance("SHA-256");
		String bodyHash = Base64.getEncoder().encodeToString(
				digest.digest(body.getBytes(StandardCharsets.UTF_8))
		);
		AccessToken token = new AccessToken(API_KEY, API_SECRET);
		token.setSha256(bodyHash);
		return token.toJwt();
	}

	private void assertUnauthorized(ThrowingRunnable runnable) {
		assertThatThrownBy(runnable::run)
				.isInstanceOfSatisfying(
						BusinessException.class,
						exception -> assertThat(exception.getErrorCode())
								.isEqualTo(
										SessionErrorCode
												.LIVEKIT_WEBHOOK_UNAUTHORIZED
								)
				);
	}

	@FunctionalInterface
	private interface ThrowingRunnable {
		void run() throws Exception;
	}
}
