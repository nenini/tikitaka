package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum CoachErrorCode implements ErrorCode {
	AI_INTERNAL_UNAUTHORIZED(
			HttpStatus.UNAUTHORIZED,
			"AI_INTERNAL_UNAUTHORIZED",
			"AI 내부 요청 인증에 실패했습니다."
	),
	AI_ANALYSIS_INVALID_REFERENCE(
			HttpStatus.BAD_REQUEST,
			"AI_ANALYSIS_INVALID_REFERENCE",
			"AI 분석 이벤트의 세션 또는 사용자 식별값이 올바르지 않습니다."
	),
	AI_ANALYSIS_SESSION_NOT_ACTIVE(
			HttpStatus.CONFLICT,
			"AI_ANALYSIS_SESSION_NOT_ACTIVE",
			"진행 중인 세션의 분석 이벤트만 저장할 수 있습니다."
	),
	AI_ANALYSIS_CONSENT_REQUIRED(
			HttpStatus.FORBIDDEN,
			"AI_ANALYSIS_CONSENT_REQUIRED",
			"해당 분석 기능에 동의하지 않은 사용자입니다."
	),
	AI_ANALYSIS_PAYLOAD_INVALID(
			HttpStatus.BAD_REQUEST,
			"AI_ANALYSIS_PAYLOAD_INVALID",
			"AI 분석 결과 payload를 저장할 수 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	CoachErrorCode(HttpStatus status, String code, String message) {
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
