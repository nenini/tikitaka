package com.date.backend.domain.room.integration;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.auth0.jwt.interfaces.JWTVerifier;
import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import io.livekit.server.WebhookReceiver;
import livekit.LivekitWebhook.WebhookEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

@Component
public class LiveKitWebhookVerifier {
	private static final Logger log =
			LoggerFactory.getLogger(LiveKitWebhookVerifier.class);
	private static final long CLOCK_SKEW_LEEWAY_SECONDS = 5L;

	private final WebhookReceiver webhookReceiver;
	private final JWTVerifier jwtVerifier;

	public LiveKitWebhookVerifier(LiveKitProperties properties) {
		this.webhookReceiver = properties.configured()
				? new WebhookReceiver(properties.apiKey(), properties.apiSecret())
				: null;
		this.jwtVerifier = properties.configured()
				? JWT.require(Algorithm.HMAC256(properties.apiSecret()))
						.withIssuer(properties.apiKey())
						.acceptLeeway(CLOCK_SKEW_LEEWAY_SECONDS)
						.build()
				: null;
	}

	public WebhookEvent verify(String body, String authorizationHeader) {
		if (webhookReceiver == null) {
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_NOT_CONFIGURED
			);
		}
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_UNAUTHORIZED
			);
		}

		try {
			DecodedJWT decodedJwt = jwtVerifier.verify(authorizationHeader);
			verifyBodyDigest(body, decodedJwt);
			return webhookReceiver.receive(body, authorizationHeader, true);
		} catch (RuntimeException exception) {
			log.warn(
					"LiveKit webhook verification failed. cause={}, message={}",
					exception.getClass().getSimpleName(),
					exception.getMessage()
			);
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_UNAUTHORIZED
			);
		}
	}

	private void verifyBodyDigest(String body, DecodedJWT decodedJwt) {
		String claimedDigest = decodedJwt.getClaim("sha256").asString();
		String actualDigest = Base64.getEncoder().encodeToString(
				sha256(body)
		);
		if (claimedDigest == null || !MessageDigest.isEqual(
				claimedDigest.getBytes(StandardCharsets.UTF_8),
				actualDigest.getBytes(StandardCharsets.UTF_8)
		)) {
			throw new IllegalArgumentException(
					"sha256 checksum of body does not match"
			);
		}
	}

	private byte[] sha256(String body) {
		try {
			return MessageDigest.getInstance("SHA-256").digest(
					body.getBytes(StandardCharsets.UTF_8)
			);
		} catch (Exception exception) {
			throw new IllegalStateException(
					"SHA-256 algorithm is unavailable",
					exception
			);
		}
	}
}
