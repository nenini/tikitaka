package com.date.backend.global.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
	INVALID_INPUT(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "요청 값이 올바르지 않습니다."),
	INVALID_REQUEST_BODY(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_BODY", "요청 본문을 읽을 수 없습니다."),
	DUPLICATE_EMAIL(HttpStatus.CONFLICT, "DUPLICATE_EMAIL", "이미 가입된 이메일입니다."),
	DUPLICATE_NICKNAME(HttpStatus.CONFLICT, "DUPLICATE_NICKNAME", "이미 사용 중인 닉네임입니다."),
	PROFILE_ALREADY_EXISTS(HttpStatus.CONFLICT, "PROFILE_ALREADY_EXISTS", "이미 프로필이 등록되어 있습니다."),
	PROFILE_NOT_FOUND(HttpStatus.NOT_FOUND, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다."),
	SURVEY_ALREADY_EXISTS(HttpStatus.CONFLICT, "SURVEY_ALREADY_EXISTS", "이미 설문이 등록되어 있습니다."),
	SURVEY_NOT_FOUND(HttpStatus.NOT_FOUND, "SURVEY_NOT_FOUND", "설문 응답을 찾을 수 없습니다."),
	INVALID_SURVEY_OPTION(HttpStatus.BAD_REQUEST, "INVALID_SURVEY_OPTION", "유효하지 않은 설문 선택지가 포함되어 있습니다."),
	INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "인증이 필요합니다."),
	FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다."),
	INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "유효하지 않은 토큰입니다."),
	INVALID_PASSWORD_RESET_TOKEN(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD_RESET_TOKEN", "유효하지 않거나 만료된 비밀번호 재설정 토큰입니다."),
	INACTIVE_ACCOUNT(HttpStatus.FORBIDDEN, "INACTIVE_ACCOUNT", "활성 상태가 아닌 계정입니다."),
	UNSUPPORTED_OAUTH_PROVIDER(HttpStatus.BAD_REQUEST, "UNSUPPORTED_OAUTH_PROVIDER", "지원하지 않는 OAuth 제공자입니다."),
	OAUTH_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "OAUTH_NOT_CONFIGURED", "OAuth 제공자 설정이 완료되지 않았습니다."),
	OAUTH_AUTHENTICATION_FAILED(HttpStatus.UNAUTHORIZED, "OAUTH_AUTHENTICATION_FAILED", "OAuth 인증에 실패했습니다."),
	INVALID_OAUTH_STATE(HttpStatus.BAD_REQUEST, "INVALID_OAUTH_STATE", "유효하지 않은 OAuth state입니다."),
	RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "요청한 리소스를 찾을 수 없습니다."),
	METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 HTTP 메서드입니다."),
	UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 Content-Type입니다."),
	INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;

	ErrorCode(HttpStatus status, String code, String message) {
		this.status = status;
		this.code = code;
		this.message = message;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}

	public String message() {
		return message;
	}
}
