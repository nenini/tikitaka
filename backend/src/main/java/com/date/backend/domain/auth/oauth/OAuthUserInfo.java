package com.date.backend.domain.auth.oauth;

public record OAuthUserInfo(
		String providerUserId,
		String email,
		String name
) {
}
