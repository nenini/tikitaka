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
	SESSION_PARTICIPANTS_NOT_CONNECTED(
			HttpStatus.CONFLICT,
			"SESSION_PARTICIPANTS_NOT_CONNECTED",
			"모든 참여자가 LiveKit에 연결되어야 세션을 시작할 수 있습니다."
	),
	SESSION_NOT_IN_PROGRESS(
			HttpStatus.CONFLICT,
			"SESSION_NOT_IN_PROGRESS",
			"진행 중인 세션에서만 실시간 상태를 변경할 수 있습니다."
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
	),
	SESSION_LIVEKIT_ROOM_NOT_CONFIGURED(
			HttpStatus.SERVICE_UNAVAILABLE,
			"SESSION_LIVEKIT_ROOM_NOT_CONFIGURED",
			"세션의 LiveKit Room 정보가 준비되지 않았습니다."
	),
	SESSION_CONNECTION_CONFLICT(
			HttpStatus.CONFLICT,
			"SESSION_CONNECTION_CONFLICT",
			"현재 세션 연결과 일치하지 않는 요청입니다."
	),
	SESSION_EXTENSION_WINDOW_NOT_OPEN(
			HttpStatus.CONFLICT,
			"SESSION_EXTENSION_WINDOW_NOT_OPEN",
			"세션 종료 5분 전부터 의사를 선택할 수 있습니다."
	),
	SESSION_EXTENSION_DECISION_CONFLICT(
			HttpStatus.CONFLICT,
			"SESSION_EXTENSION_DECISION_CONFLICT",
			"이미 제출한 의사와 다른 값으로 변경할 수 없습니다."
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
