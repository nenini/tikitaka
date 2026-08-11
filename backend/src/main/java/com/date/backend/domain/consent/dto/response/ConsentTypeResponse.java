package com.date.backend.domain.consent.dto.response;

import com.date.backend.domain.consent.domain.ConsentType;

public record ConsentTypeResponse(
		Long consentTypeId,
		String code,
		String name,
		String version
) {
	public static ConsentTypeResponse from(ConsentType consentType) {
		return new ConsentTypeResponse(
				consentType.getId(),
				consentType.getCode(),
				consentType.getName(),
				consentType.getVersion()
		);
	}
}
