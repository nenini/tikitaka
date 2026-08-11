package com.date.backend.domain.room.integration;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import io.livekit.server.AccessToken;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

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

	@Test
	void acceptsSmallClockSkewFromLiveKit() throws Exception {
		String body = """
				{"event":"participant_joined","id":"EV_clock_skew"}
				""";
		String bodyHash = bodyHash(body);
		Instant now = Instant.now();
		String token = JWT.create()
				.withIssuer(API_KEY)
				.withNotBefore(Date.from(now.plusSeconds(3)))
				.withExpiresAt(Date.from(now.plusSeconds(60)))
				.withClaim("sha256", bodyHash)
				.sign(Algorithm.HMAC256(API_SECRET));

		var event = verifier.verify(body, token);

		assertThat(event.getId()).isEqualTo("EV_clock_skew");
	}

	@Test
	void rejectsTokenBeyondAllowedClockSkew() throws Exception {
		String body = """
				{"event":"participant_joined","id":"EV_large_clock_skew"}
				""";
		Instant now = Instant.now();
		String token = JWT.create()
				.withIssuer(API_KEY)
				.withNotBefore(Date.from(now.plusSeconds(10)))
				.withExpiresAt(Date.from(now.plusSeconds(60)))
				.withClaim("sha256", bodyHash(body))
				.sign(Algorithm.HMAC256(API_SECRET));

		assertUnauthorized(() -> verifier.verify(body, token));
	}

	private String signedToken(String body) throws Exception {
		AccessToken token = new AccessToken(API_KEY, API_SECRET);
		token.setSha256(bodyHash(body));
		return token.toJwt();
	}

	private String bodyHash(String body) throws Exception {
		MessageDigest digest = MessageDigest.getInstance("SHA-256");
		return Base64.getEncoder().encodeToString(
				digest.digest(body.getBytes(StandardCharsets.UTF_8))
		);
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
