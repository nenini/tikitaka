package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum MissionErrorCode implements ErrorCode {
	SESSION_MISSION_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"SESSION_MISSION_NOT_FOUND",
			"세션 미션을 찾을 수 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	MissionErrorCode(HttpStatus status, String code, String message) {
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
