package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum SilenceErrorCode implements ErrorCode {
	SILENCE_EVENT_CONTRACT_INVALID(
			HttpStatus.BAD_REQUEST,
			"SILENCE_EVENT_CONTRACT_INVALID",
			"AI 침묵 이벤트 계약이 올바르지 않습니다."
	),
	QUESTION_RECOMMENDATION_CONTRACT_INVALID(
			HttpStatus.BAD_REQUEST,
			"QUESTION_RECOMMENDATION_CONTRACT_INVALID",
			"AI 질문 추천 이벤트 계약이 올바르지 않습니다."
	),
	QUESTION_CARD_NOT_AVAILABLE(
			HttpStatus.NOT_FOUND,
			"QUESTION_CARD_NOT_AVAILABLE",
			"사용 가능한 범용 질문 카드가 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	SilenceErrorCode(HttpStatus status, String code, String message) {
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
