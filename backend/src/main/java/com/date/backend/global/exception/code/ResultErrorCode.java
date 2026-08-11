package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ResultErrorCode implements ErrorCode {
	EVALUATION_SESSION_NOT_COMPLETED(
			HttpStatus.CONFLICT,
			"EVALUATION_SESSION_NOT_COMPLETED",
			"정상 종료된 세션만 평가할 수 있습니다."
	),
	EVALUATION_NOT_PARTICIPANT(
			HttpStatus.FORBIDDEN,
			"EVALUATION_NOT_PARTICIPANT",
			"세션 참가자만 평가할 수 있습니다."
	),
	EVALUATION_ALREADY_SUBMITTED(
			HttpStatus.CONFLICT,
			"EVALUATION_ALREADY_SUBMITTED",
			"이미 상대 평가를 제출했습니다."
	),
	EVALUATION_DEADLINE_EXPIRED(
			HttpStatus.CONFLICT,
			"EVALUATION_DEADLINE_EXPIRED",
			"상대 평가 제출 기한이 지났습니다."
	),
	EVALUATION_RESULT_LOCKED(
			HttpStatus.FORBIDDEN,
			"EVALUATION_RESULT_LOCKED",
			"본인의 평가를 제출해야 상대 평가를 확인할 수 있습니다."
	),
	EVALUATION_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"EVALUATION_NOT_FOUND",
			"평가 결과를 찾을 수 없습니다."
	),
	EVALUATION_NOT_COMPLETED(
			HttpStatus.CONFLICT,
			"EVALUATION_NOT_COMPLETED",
			"양측 평가가 모두 제출되지 않았습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	ResultErrorCode(HttpStatus status, String code, String message) {
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
