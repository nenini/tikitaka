package com.date.backend.domain.auth.password;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "auth.password-reset")
public record PasswordResetProperties(
		long tokenValiditySeconds,
		String url,
		String from
) {
}
