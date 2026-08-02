package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum SafetyErrorCode implements ErrorCode {
	SAFETY_EVENT_CONTRACT_INVALID(
			HttpStatus.BAD_REQUEST,
			"SAFETY_EVENT_CONTRACT_INVALID",
			"AI 안전 이벤트 계약이 올바르지 않습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	SafetyErrorCode(HttpStatus status, String code, String message) {
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
