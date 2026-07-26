package com.date.backend.domain.match.api;

import com.date.backend.domain.match.dto.request.MatchRequestSaveRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSlotInput;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class MatchRequestControllerValidationTest {

	@Test
	void interfaceValidationRejectsInvalidAgeAndAvailability() throws NoSuchMethodException {
		MatchRequestController controller = new MatchRequestController(null);
		Method createMethod = MatchRequestController.class.getMethod(
				"create",
				AuthUser.class,
				MatchRequestSaveRequest.class
		);
		MatchRequestSaveRequest invalidRequest = new MatchRequestSaveRequest(
				(short) 30,
				(short) 25,
				List.of(new MatchRequestSlotInput(
						DayOfWeek.MONDAY,
						LocalTime.of(22, 0),
						LocalTime.of(19, 0)
				))
		);

		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Set<ConstraintViolation<MatchRequestController>> violations = assertDoesNotThrow(
					() -> validatorFactory.getValidator()
							.forExecutables()
							.validateParameters(
									controller,
									createMethod,
									new Object[]{null, invalidRequest}
							)
			);

			assertThat(violations).hasSizeGreaterThanOrEqualTo(2);
		}
	}
}
