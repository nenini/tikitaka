package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum SurveyErrorCode implements ErrorCode {
	SURVEY_ALREADY_EXISTS(
			HttpStatus.CONFLICT,
			"SURVEY_ALREADY_EXISTS",
			"이미 설문이 등록되어 있습니다."
	),
	SURVEY_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"SURVEY_NOT_FOUND",
			"설문 응답을 찾을 수 없습니다."
	),
	INVALID_SURVEY_OPTION(
			HttpStatus.BAD_REQUEST,
			"INVALID_SURVEY_OPTION",
			"유효하지 않은 설문 선택지가 포함되어 있습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	SurveyErrorCode(HttpStatus status, String code, String message) {
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
