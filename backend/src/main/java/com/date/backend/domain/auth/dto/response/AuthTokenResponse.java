package com.date.backend.domain.auth.dto.response;

public record AuthTokenResponse(
		String tokenType,
		String accessToken,
		long accessTokenExpiresIn,
		String refreshToken,
		long refreshTokenExpiresIn
) {
}
