package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum ModerationErrorCode implements ErrorCode {
	REPORT_SESSION_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"REPORT_SESSION_NOT_FOUND",
			"신고 대상 세션을 찾을 수 없습니다."
	),
	REPORTER_NOT_SESSION_PARTICIPANT(
			HttpStatus.FORBIDDEN,
			"REPORTER_NOT_SESSION_PARTICIPANT",
			"세션 참여자만 상대방을 신고할 수 있습니다."
	),
	REPORTED_USER_NOT_SESSION_PARTICIPANT(
			HttpStatus.BAD_REQUEST,
			"REPORTED_USER_NOT_SESSION_PARTICIPANT",
			"피신고 사용자가 해당 세션의 참여자가 아닙니다."
	),
	SELF_REPORT_NOT_ALLOWED(
			HttpStatus.BAD_REQUEST,
			"SELF_REPORT_NOT_ALLOWED",
			"자기 자신을 신고할 수 없습니다."
	),
	DUPLICATE_SESSION_REPORT(
			HttpStatus.CONFLICT,
			"DUPLICATE_SESSION_REPORT",
			"동일한 세션과 대상에 대한 신고가 이미 접수되었습니다."
	),
	BLOCK_TARGET_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"BLOCK_TARGET_NOT_FOUND",
			"차단 대상 사용자를 찾을 수 없습니다."
	),
	SELF_BLOCK_NOT_ALLOWED(
			HttpStatus.BAD_REQUEST,
			"SELF_BLOCK_NOT_ALLOWED",
			"자기 자신을 차단할 수 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	ModerationErrorCode(HttpStatus status, String code, String message) {
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
