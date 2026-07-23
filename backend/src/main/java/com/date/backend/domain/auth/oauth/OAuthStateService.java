package com.date.backend.domain.auth.oauth;

import com.date.backend.domain.auth.domain.OAuthProvider;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

@Component
public class OAuthStateService {
	public static final String COOKIE_NAME = "oauth_state";
	private static final int STATE_BYTES = 32;

	private final OAuthProperties properties;
	private final SecureRandom secureRandom = new SecureRandom();

	public OAuthStateService(OAuthProperties properties) {
		this.properties = properties;
	}

	public String create(OAuthProvider provider) {
		byte[] bytes = new byte[STATE_BYTES];
		secureRandom.nextBytes(bytes);
		return provider.name().toLowerCase() + "." + Instant.now().getEpochSecond() + "."
				+ Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	public void validate(OAuthProvider provider, String queryState, String cookieState) {
		if (queryState == null || cookieState == null
				|| !isFreshState(provider, queryState)
				|| !MessageDigest.isEqual(
				queryState.getBytes(StandardCharsets.UTF_8),
				cookieState.getBytes(StandardCharsets.UTF_8))) {
			throw new BusinessException(ErrorCode.INVALID_OAUTH_STATE);
		}
	}

	private boolean isFreshState(OAuthProvider provider, String state) {
		try {
			String[] parts = state.split("\\.", 3);
			long issuedAt = Long.parseLong(parts[1]);
			long age = Instant.now().getEpochSecond() - issuedAt;
			return parts.length == 3
					&& parts[0].equals(provider.name().toLowerCase())
					&& age >= 0
					&& age <= properties.stateValiditySeconds();
		} catch (RuntimeException exception) {
			return false;
		}
	}

	public ResponseCookie cookie(String state) {
		return ResponseCookie.from(COOKIE_NAME, state)
				.httpOnly(true)
				.secure(properties.secureCookie())
				.sameSite("Lax")
				.path("/api/v1/auth/oauth2")
				.maxAge(Duration.ofSeconds(properties.stateValiditySeconds()))
				.build();
	}

	public ResponseCookie clearCookie() {
		return ResponseCookie.from(COOKIE_NAME, "")
				.httpOnly(true)
				.secure(properties.secureCookie())
				.sameSite("Lax")
				.path("/api/v1/auth/oauth2")
				.maxAge(Duration.ZERO)
				.build();
	}
}
