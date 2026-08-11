package com.date.backend.domain.safety.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SafetySeverityTest {

	@Test
	void repeatedDetectionEscalatesWithoutAutomaticSanction() {
		assertThat(SafetySeverity.effective(SafetySeverity.LOW, 1))
				.isEqualTo(SafetySeverity.LOW);
		assertThat(SafetySeverity.effective(SafetySeverity.LOW, 3))
				.isEqualTo(SafetySeverity.MEDIUM);
		assertThat(SafetySeverity.effective(SafetySeverity.LOW, 5))
				.isEqualTo(SafetySeverity.HIGH);
	}
}
