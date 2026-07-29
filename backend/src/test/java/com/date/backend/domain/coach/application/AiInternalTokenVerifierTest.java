package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.config.AiSessionProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiInternalTokenVerifierTest {

	@Test
	void acceptsConfiguredToken() {
		AiInternalTokenVerifier verifier =
				new AiInternalTokenVerifier(new AiSessionProperties("secret"));

		assertThatCode(() -> verifier.verify("secret")).doesNotThrowAnyException();
	}

	@Test
	void rejectsMissingConfigurationInsteadOfBypassingAuthentication() {
		AiInternalTokenVerifier verifier =
				new AiInternalTokenVerifier(new AiSessionProperties(""));

		assertThatThrownBy(() -> verifier.verify(""))
				.isInstanceOfSatisfying(
						BusinessException.class,
						exception -> assertThat(exception.getErrorCode())
								.isEqualTo(CoachErrorCode.AI_INTERNAL_UNAUTHORIZED)
				);
	}
}
