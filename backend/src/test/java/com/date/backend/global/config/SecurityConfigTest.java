package com.date.backend.global.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigTest {

	@Test
	void allowsConfiguredFrontendOriginWithoutTrailingSlash() {
		SecurityConfig config = new SecurityConfig();
		var source = config.corsConfigurationSource(
				"http://192.168.0.20:5173/"
		);
		var request = new MockHttpServletRequest(
				"OPTIONS",
				"/api/v1/auth/login"
		);

		var cors = source.getCorsConfiguration(request);

		assertThat(cors).isNotNull();
		assertThat(cors.getAllowedOrigins())
				.containsExactly("http://192.168.0.20:5173");
		assertThat(cors.getAllowedMethods())
				.contains("GET", "POST", "OPTIONS");
		assertThat(cors.getAllowedHeaders())
				.contains("Authorization", "Content-Type");
		assertThat(cors.getAllowCredentials()).isTrue();
	}
}
