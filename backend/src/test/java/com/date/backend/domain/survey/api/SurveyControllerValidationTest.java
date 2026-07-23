package com.date.backend.domain.survey.api;

import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class SurveyControllerValidationTest {

	@Test
	void interfaceValidationConstraintsAreAppliedWithoutRedefinition() throws NoSuchMethodException {
		SurveyController controller = new SurveyController(null);
		Method createMethod = SurveyController.class.getMethod(
				"create",
				AuthUser.class,
				SurveySaveRequest.class
		);
		SurveySaveRequest invalidRequest = new SurveySaveRequest(
				1L,
				List.of(1L, 1L, 2L),
				List.of(3L, 4L),
				(short) 35,
				(short) 30,
				List.of()
		);

		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Set<ConstraintViolation<SurveyController>> violations = assertDoesNotThrow(
					() -> validatorFactory.getValidator()
							.forExecutables()
							.validateParameters(
									controller,
									createMethod,
									new Object[]{null, invalidRequest}
							)
			);

			assertThat(violations).isNotEmpty();
		}
	}
}
