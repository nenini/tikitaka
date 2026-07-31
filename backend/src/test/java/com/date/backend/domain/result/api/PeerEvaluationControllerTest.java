package com.date.backend.domain.result.api;

import com.date.backend.domain.result.application.PeerEvaluationService;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PeerEvaluationControllerTest {

	@Test
	void controllerMethodConstraintsMatchSwaggerInterface() throws Exception {
		PeerEvaluationController controller =
				new PeerEvaluationController(mock(PeerEvaluationService.class));
		AuthUser authUser =
				new AuthUser(2L, "match.woman@example.com", UserRole.USER);
		PeerEvaluationSubmitRequest request =
				new PeerEvaluationSubmitRequest(
						5, 4, 5, 4, 4, 5,
						"상대방의 이야기를 잘 들어줬어요.",
						"질문을 조금 더 자연스럽게 이어가면 좋을 것 같아요."
				);
		Method submitMethod = PeerEvaluationController.class.getMethod(
				"submit",
				AuthUser.class,
				Long.class,
				PeerEvaluationSubmitRequest.class
		);

		try (var factory = Validation.buildDefaultValidatorFactory()) {
			var violations = factory.getValidator()
					.forExecutables()
					.validateParameters(
							controller,
							submitMethod,
							new Object[]{authUser, 1L, request}
					);

			assertThat(violations).isEmpty();
		}
	}
}
