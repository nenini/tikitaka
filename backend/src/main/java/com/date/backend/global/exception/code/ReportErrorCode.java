package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ReportErrorCode implements ErrorCode {
	ANALYSIS_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "ANALYSIS_SESSION_NOT_FOUND", "분석 대상 세션을 찾을 수 없습니다."),
	ANALYSIS_PARTICIPANT_NOT_FOUND(HttpStatus.BAD_REQUEST, "ANALYSIS_PARTICIPANT_NOT_FOUND", "세션에 참여하지 않은 사용자의 분석 결과가 포함되어 있습니다."),
	ANALYSIS_CONTRACT_INVALID(HttpStatus.BAD_REQUEST, "ANALYSIS_CONTRACT_INVALID", "세션 분석 결과 계약이 올바르지 않습니다."),
	ANALYSIS_IDEMPOTENCY_CONFLICT(HttpStatus.CONFLICT, "ANALYSIS_IDEMPOTENCY_CONFLICT", "동일한 멱등 키 또는 분석 버전에 다른 요청이 이미 저장되어 있습니다."),
	ANALYSIS_SERIALIZATION_FAILED(HttpStatus.BAD_REQUEST, "ANALYSIS_SERIALIZATION_FAILED", "세션 분석 지표를 저장할 수 없습니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;
	ReportErrorCode(HttpStatus status, String code, String message) {
		this.status = status; this.code = code; this.message = message;
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
	public String message() { return message; }
}
