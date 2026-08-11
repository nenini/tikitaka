package com.date.backend.domain.consent.application;

import com.date.backend.domain.consent.repository.UserConsentRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(readOnly = true)
public class SessionAnalysisConsentPolicy {
	private static final String INTEGRATED_SERVICE_CONSENT =
			"INTEGRATED_SERVICE_CONSENT";
	private static final String FACE_CAPTURE_CONSENT =
			"FACE_CAPTURE_CONSENT";

	private final UserConsentRepository userConsentRepository;

	public SessionAnalysisConsentPolicy(UserConsentRepository userConsentRepository) {
		this.userConsentRepository = userConsentRepository;
	}

	public SessionAnalysisConsent resolve(Long userId) {
		boolean integratedAnalysisConsented = hasActiveConsent(
				userId,
				INTEGRATED_SERVICE_CONSENT
		);
		boolean faceAnalysisConsented = hasActiveConsent(
				userId,
				FACE_CAPTURE_CONSENT
		);
		return new SessionAnalysisConsent(
				integratedAnalysisConsented,
				integratedAnalysisConsented && faceAnalysisConsented
		);
	}

	private boolean hasActiveConsent(Long userId, String consentTypeCode) {
		return userConsentRepository
				.existsByUser_IdAndConsentType_CodeAndConsentType_ActiveTrueAndConsentedTrue(
						userId,
						consentTypeCode
				);
	}

	public record SessionAnalysisConsent(
			boolean voiceAnalysisEnabled,
			boolean expressionAnalysisEnabled
	) {
	}
}
