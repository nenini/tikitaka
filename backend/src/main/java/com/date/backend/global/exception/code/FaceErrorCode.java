package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum FaceErrorCode implements ErrorCode {
	ANALYSIS_REQUEST_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"FACE_ANALYSIS_REQUEST_NOT_FOUND",
			"얼굴상 분석 요청을 찾을 수 없습니다."
	),
	ANALYSIS_REQUEST_FORBIDDEN(
			HttpStatus.FORBIDDEN,
			"FACE_ANALYSIS_REQUEST_FORBIDDEN",
			"해당 얼굴상 분석 요청에 접근할 수 없습니다."
	),
	ANALYSIS_REQUEST_NOT_PENDING(
			HttpStatus.CONFLICT,
			"FACE_ANALYSIS_REQUEST_NOT_PENDING",
			"대기 중인 얼굴상 분석 요청만 처리할 수 있습니다."
	),
	ANALYSIS_REQUEST_EXPIRED(
			HttpStatus.GONE,
			"FACE_ANALYSIS_REQUEST_EXPIRED",
			"만료된 얼굴상 분석 요청입니다."
	),
	ANALYSIS_RESULT_ALREADY_EXISTS(
			HttpStatus.CONFLICT,
			"FACE_ANALYSIS_RESULT_ALREADY_EXISTS",
			"이미 얼굴상 분석 결과가 저장된 요청입니다."
	),
	INVALID_ANALYSIS_RESULT(
			HttpStatus.BAD_REQUEST,
			"INVALID_FACE_ANALYSIS_RESULT",
			"유효하지 않은 얼굴상 분석 결과입니다."
	),
	FACE_TYPE_NOT_APPLICABLE(
			HttpStatus.BAD_REQUEST,
			"FACE_TYPE_NOT_APPLICABLE",
			"사용자 성별에 적용할 수 없는 얼굴상 결과입니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	FaceErrorCode(HttpStatus status, String code, String message) {
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
