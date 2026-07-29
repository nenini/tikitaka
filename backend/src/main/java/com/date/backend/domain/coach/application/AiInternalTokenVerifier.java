package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.config.AiSessionProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class AiInternalTokenVerifier {
	private final AiSessionProperties properties;

	public AiInternalTokenVerifier(AiSessionProperties properties) {
		this.properties = properties;
	}

	public void verify(String token) {
		String configured = properties.internalToken();
		if (configured.isBlank() || token == null || token.isBlank()
				|| !MessageDigest.isEqual(
						configured.getBytes(StandardCharsets.UTF_8),
						token.getBytes(StandardCharsets.UTF_8)
				)) {
			throw new BusinessException(CoachErrorCode.AI_INTERNAL_UNAUTHORIZED);
		}
	}
}
