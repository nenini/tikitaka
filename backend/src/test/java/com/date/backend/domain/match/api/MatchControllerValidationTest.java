package com.date.backend.domain.match.api;

import com.date.backend.domain.match.dto.request.MatchCancellationRequest;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class MatchControllerValidationTest {

	@Test
	void rejectsNonPositivePairIdAndTooLongCancellationReason()
			throws NoSuchMethodException {
		MatchController controller = new MatchController(null, null);
		Method cancelMethod = MatchController.class.getMethod(
				"cancel",
				AuthUser.class,
				Long.class,
				MatchCancellationRequest.class
		);
		MatchCancellationRequest invalidRequest =
				new MatchCancellationRequest("가".repeat(501));

		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Set<ConstraintViolation<MatchController>> violations = assertDoesNotThrow(
					() -> validatorFactory.getValidator()
							.forExecutables()
							.validateParameters(
									controller,
									cancelMethod,
									new Object[]{null, 0L, invalidRequest}
							)
			);

			assertThat(violations).hasSize(2);
		}
	}
}
