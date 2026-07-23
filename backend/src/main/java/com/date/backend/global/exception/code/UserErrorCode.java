package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum UserErrorCode implements ErrorCode {
	INACTIVE_ACCOUNT(HttpStatus.FORBIDDEN, "INACTIVE_ACCOUNT", "활성 상태가 아닌 계정입니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;

	UserErrorCode(HttpStatus status, String code, String message) {
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
