package com.date.backend.domain.consent.dto.response;

import com.date.backend.domain.consent.domain.ConsentType;
import com.date.backend.domain.consent.domain.UserConsent;

import java.time.LocalDateTime;

public record UserConsentStatusResponse(
		Long consentTypeId,
		String code,
		String name,
		String version,
		boolean consented,
		LocalDateTime consentedAt,
		LocalDateTime withdrawnAt
) {
	public static UserConsentStatusResponse of(ConsentType consentType, UserConsent userConsent) {
		return new UserConsentStatusResponse(
				consentType.getId(),
				consentType.getCode(),
				consentType.getName(),
				consentType.getVersion(),
				userConsent != null && userConsent.isConsented(),
				userConsent == null ? null : userConsent.getConsentedAt(),
				userConsent == null ? null : userConsent.getWithdrawnAt()
		);
	}
}
