package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.integration.AiSessionEventProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class AiSessionEventPropertiesTest {

	@Test
	void normalizesUrlAndAppliesDefaults() {
		AiSessionEventProperties properties = new AiSessionEventProperties(
				"http://localhost:8000/",
				"api/v1/sessions/events",
				null,
				null,
				" token ",
				0,
				null
		);

		assertThat(properties.eventUrl())
				.isEqualTo("http://localhost:8000/api/v1/sessions/events");
		assertThat(properties.connectTimeout()).isEqualTo(Duration.ofSeconds(3));
		assertThat(properties.requestTimeout()).isEqualTo(Duration.ofSeconds(5));
		assertThat(properties.internalToken()).isEqualTo("token");
		assertThat(properties.maxAttempts()).isEqualTo(3);
		assertThat(properties.retryDelay()).isEqualTo(Duration.ofSeconds(1));
		assertThat(properties.configured()).isTrue();
	}

	@Test
	void remainsUnconfiguredWithoutBaseUrl() {
		AiSessionEventProperties properties = new AiSessionEventProperties(
				null,
				null,
				null,
				null,
				null,
				3,
				Duration.ofSeconds(1)
		);

		assertThat(properties.configured()).isFalse();
	}
}
