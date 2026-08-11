package com.date.backend.global.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "auth.jwt")
public record JwtProperties(
		String secret,
		long accessTokenValiditySeconds,
		long refreshTokenValiditySeconds
) {
}
