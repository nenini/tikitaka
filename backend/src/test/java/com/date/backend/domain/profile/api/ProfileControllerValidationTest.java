package com.date.backend.domain.profile.api;

import com.date.backend.domain.profile.dto.request.ProfileUpdateRequest;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class ProfileControllerValidationTest {

	@Test
	void interfaceValidationConstraintsAreAppliedWithoutRedefinition() throws NoSuchMethodException {
		ProfileController controller = new ProfileController(null);
		Method updateMethod = ProfileController.class.getMethod(
				"update",
				AuthUser.class,
				ProfileUpdateRequest.class
		);
		ProfileUpdateRequest invalidRequest = new ProfileUpdateRequest(" ", null, null);

		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Set<ConstraintViolation<ProfileController>> violations = assertDoesNotThrow(
					() -> validatorFactory.getValidator()
							.forExecutables()
							.validateParameters(controller, updateMethod, new Object[]{null, invalidRequest})
			);

			assertThat(violations).isNotEmpty();
		}
	}

	@Test
	void publicProfileUserIdMustBePositive() throws NoSuchMethodException {
		ProfileController controller = new ProfileController(null);
		Method publicProfileMethod = ProfileController.class.getMethod("getPublicProfile", Long.class);

		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Set<ConstraintViolation<ProfileController>> violations = assertDoesNotThrow(
					() -> validatorFactory.getValidator()
							.forExecutables()
							.validateParameters(controller, publicProfileMethod, new Object[]{0L})
			);

			assertThat(violations).isNotEmpty();
		}
	}
}
