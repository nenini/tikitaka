package com.date.backend.domain.auth.oauth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"app.frontend.base-url=http://192.168.0.20:5173"
})
@ActiveProfiles("test")
class OAuthRedirectConfigurationTest {

	@Value("${auth.oauth.success-redirect}")
	private String successRedirect;

	@Test
	void buildsOAuthCallbackFromFrontendBaseUrl() {
		assertThat(successRedirect)
				.isEqualTo("http://192.168.0.20:5173/oauth/callback");
	}
}
