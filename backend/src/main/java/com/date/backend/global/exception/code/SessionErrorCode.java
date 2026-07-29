package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum SessionErrorCode implements ErrorCode {
	SESSION_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"SESSION_NOT_FOUND",
			"세션을 찾을 수 없습니다."
	),
	SESSION_NOT_PARTICIPANT(
			HttpStatus.FORBIDDEN,
			"SESSION_NOT_PARTICIPANT",
			"해당 세션의 참여자가 아닙니다."
	),
	SESSION_JOIN_TIME_NOT_ALLOWED(
			HttpStatus.CONFLICT,
			"SESSION_JOIN_TIME_NOT_ALLOWED",
			"현재는 세션에 입장할 수 있는 시간이 아닙니다."
	),
	SESSION_STATE_CONFLICT(
			HttpStatus.CONFLICT,
			"SESSION_STATE_CONFLICT",
			"현재 세션 상태에서는 요청을 처리할 수 없습니다."
	),
	SESSION_PARTICIPANTS_NOT_JOINED(
			HttpStatus.CONFLICT,
			"SESSION_PARTICIPANTS_NOT_JOINED",
			"모든 참여자가 입장해야 세션을 시작할 수 있습니다."
	),
	SESSION_PARTICIPANTS_NOT_READY(
			HttpStatus.CONFLICT,
			"SESSION_PARTICIPANTS_NOT_READY",
			"모든 참여자가 준비 완료해야 세션을 시작할 수 있습니다."
	),
	LIVEKIT_WEBHOOK_UNAUTHORIZED(
			HttpStatus.UNAUTHORIZED,
			"LIVEKIT_WEBHOOK_UNAUTHORIZED",
			"LiveKit Webhook 인증에 실패했습니다."
	),
	LIVEKIT_WEBHOOK_NOT_CONFIGURED(
			HttpStatus.SERVICE_UNAVAILABLE,
			"LIVEKIT_WEBHOOK_NOT_CONFIGURED",
			"LiveKit Webhook 인증 설정이 필요합니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	SessionErrorCode(HttpStatus status, String code, String message) {
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
