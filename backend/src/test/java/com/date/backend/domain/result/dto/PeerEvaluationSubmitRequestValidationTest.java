package com.date.backend.domain.result.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PeerEvaluationSubmitRequestValidationTest {
	@Test
	void acceptsOptionalTextAsNull() {
		PeerEvaluationSubmitRequest request = new PeerEvaluationSubmitRequest(
				5, 4, 5, 4, 4, 5, null, null
		);

		assertThat(validate(request)).isZero();
	}

	@Test
	void rejectsTextLongerThanOneThousandCharacters() {
		PeerEvaluationSubmitRequest request = new PeerEvaluationSubmitRequest(
				5, 4, 5, 4, 4, 5, "가".repeat(1001), null
		);

		assertThat(validate(request)).isEqualTo(1);
	}

	@Test
	void rejectsScoreOutsideOneToFive() {
		PeerEvaluationSubmitRequest request = new PeerEvaluationSubmitRequest(
				0, 6, 5, 4, 4, 5, null, null
		);

		assertThat(validate(request)).isEqualTo(2);
	}

	private int validate(PeerEvaluationSubmitRequest request) {
		try (ValidatorFactory factory =
					 Validation.buildDefaultValidatorFactory()) {
			Validator validator = factory.getValidator();
			return validator.validate(request).size();
		}
	}
}
