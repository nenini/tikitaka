package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ConsentErrorCode implements ErrorCode {
	CONSENT_TYPE_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"CONSENT_TYPE_NOT_FOUND",
			"활성화된 동의 항목을 찾을 수 없습니다."
	),
	DUPLICATE_CONSENT_TYPE(
			HttpStatus.BAD_REQUEST,
			"DUPLICATE_CONSENT_TYPE",
			"동일한 동의 항목을 중복해서 저장할 수 없습니다."
	),
	USER_CONSENT_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"USER_CONSENT_NOT_FOUND",
			"사용자의 동의 이력을 찾을 수 없습니다."
	),
	CONSENT_ALREADY_WITHDRAWN(
			HttpStatus.CONFLICT,
			"CONSENT_ALREADY_WITHDRAWN",
			"이미 철회된 동의입니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	ConsentErrorCode(HttpStatus status, String code, String message) {
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
