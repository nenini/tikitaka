package com.date.backend.domain.auth.domain;

import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;

import java.util.Locale;

public enum OAuthProvider {
	GOOGLE,
	NAVER;

	public static OAuthProvider from(String value) {
		try {
			return valueOf(value.toUpperCase(Locale.ROOT));
		} catch (RuntimeException exception) {
			throw new BusinessException(ErrorCode.UNSUPPORTED_OAUTH_PROVIDER);
		}
	}
}
