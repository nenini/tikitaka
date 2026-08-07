package com.date.backend.domain.consent.application;

import com.date.backend.domain.consent.repository.UserConsentRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionAnalysisConsentPolicyTest {
	private static final Long USER_ID = 101L;

	private final UserConsentRepository repository = mock(UserConsentRepository.class);
	private final SessionAnalysisConsentPolicy policy =
			new SessionAnalysisConsentPolicy(repository);

	@Test
	void integratedConsentEnablesVoiceButFaceConsentIsAlsoRequiredForExpression() {
		when(hasConsent("INTEGRATED_SERVICE_CONSENT")).thenReturn(true);
		when(hasConsent("FACE_CAPTURE_CONSENT")).thenReturn(false);

		var result = policy.resolve(USER_ID);

		assertThat(result.voiceAnalysisEnabled()).isTrue();
		assertThat(result.expressionAnalysisEnabled()).isFalse();
	}

	@Test
	void bothConsentsEnableVoiceAndExpressionAnalysis() {
		when(hasConsent("INTEGRATED_SERVICE_CONSENT")).thenReturn(true);
		when(hasConsent("FACE_CAPTURE_CONSENT")).thenReturn(true);

		var result = policy.resolve(USER_ID);

		assertThat(result.voiceAnalysisEnabled()).isTrue();
		assertThat(result.expressionAnalysisEnabled()).isTrue();
	}

	@Test
	void faceConsentAloneDoesNotEnableAnyAnalysis() {
		when(hasConsent("INTEGRATED_SERVICE_CONSENT")).thenReturn(false);
		when(hasConsent("FACE_CAPTURE_CONSENT")).thenReturn(true);

		var result = policy.resolve(USER_ID);

		assertThat(result.voiceAnalysisEnabled()).isFalse();
		assertThat(result.expressionAnalysisEnabled()).isFalse();
	}

	private boolean hasConsent(String code) {
		return repository
				.existsByUser_IdAndConsentType_CodeAndConsentType_ActiveTrueAndConsentedTrue(
						USER_ID,
						code
				);
	}
}
