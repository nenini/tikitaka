package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AuthErrorCode implements ErrorCode {
	DUPLICATE_EMAIL(HttpStatus.CONFLICT, "DUPLICATE_EMAIL", "이미 가입된 이메일입니다."),
	INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증이 필요합니다."),
	FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다."),
	INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "유효하지 않은 토큰입니다."),
	INVALID_PASSWORD_RESET_TOKEN(
			HttpStatus.BAD_REQUEST,
			"INVALID_PASSWORD_RESET_TOKEN",
			"유효하지 않거나 만료된 비밀번호 재설정 토큰입니다."
	),
	UNSUPPORTED_OAUTH_PROVIDER(
			HttpStatus.BAD_REQUEST,
			"UNSUPPORTED_OAUTH_PROVIDER",
			"지원하지 않는 OAuth 제공자입니다."
	),
	OAUTH_NOT_CONFIGURED(
			HttpStatus.SERVICE_UNAVAILABLE,
			"OAUTH_NOT_CONFIGURED",
			"OAuth 제공자 설정이 완료되지 않았습니다."
	),
	OAUTH_AUTHENTICATION_FAILED(
			HttpStatus.UNAUTHORIZED,
			"OAUTH_AUTHENTICATION_FAILED",
			"OAuth 인증에 실패했습니다."
	),
	INVALID_OAUTH_STATE(HttpStatus.BAD_REQUEST, "INVALID_OAUTH_STATE", "유효하지 않은 OAuth state입니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;

	AuthErrorCode(HttpStatus status, String code, String message) {
		this.status = status;
		this.code = code;
		this.message = message;
	}

	@Override
	public HttpStatus status() {
		return status;
	}

	@Override
	public String code() {
		return code;
	}

	@Override
	public String message() {
		return message;
	}
}
