package com.date.backend.domain.auth.oauth;

import com.date.backend.domain.auth.domain.OAuthProvider;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "auth.oauth")
public record OAuthProperties(
		long stateValiditySeconds,
		boolean secureCookie,
		Provider google,
		Provider naver
) {
	public Provider get(OAuthProvider provider) {
		return provider == OAuthProvider.GOOGLE ? google : naver;
	}

	public record Provider(String clientId, String clientSecret, String redirectUri) {
		public boolean isConfigured() {
			return clientId != null && !clientId.isBlank()
					&& clientSecret != null && !clientSecret.isBlank()
					&& redirectUri != null && !redirectUri.isBlank();
		}
	}
}
