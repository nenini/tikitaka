package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AdminMatchErrorCode implements ErrorCode {
	MATCHING_POLICY_NOT_FOUND(HttpStatus.INTERNAL_SERVER_ERROR, "MATCHING_POLICY_NOT_FOUND", "기본 매칭 정책을 찾을 수 없습니다."),
	INVALID_MATCHING_POLICY(HttpStatus.BAD_REQUEST, "INVALID_MATCHING_POLICY", "매칭 정책값이 올바르지 않습니다."),
	EMPTY_MATCHING_POLICY_UPDATE(HttpStatus.BAD_REQUEST, "EMPTY_MATCHING_POLICY_UPDATE", "수정할 매칭 정책값을 하나 이상 입력해 주세요."),
	MATCHING_WEIGHTS_MUST_BE_UPDATED_TOGETHER(
			HttpStatus.BAD_REQUEST,
			"MATCHING_WEIGHTS_MUST_BE_UPDATED_TOGETHER",
			"얼굴상과 성격 가중치는 함께 수정해야 합니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	AdminMatchErrorCode(HttpStatus status, String code, String message) {
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
