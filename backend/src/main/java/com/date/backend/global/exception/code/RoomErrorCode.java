package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum RoomErrorCode implements ErrorCode {
	ROOM_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"ROOM_NOT_FOUND",
			"대기방을 찾을 수 없습니다."
	),
	ROOM_NOT_PARTICIPANT(
			HttpStatus.FORBIDDEN,
			"ROOM_NOT_PARTICIPANT",
			"해당 대기방의 참여자가 아닙니다."
	),
	ROOM_NOT_ENTERABLE(
			HttpStatus.CONFLICT,
			"ROOM_NOT_ENTERABLE",
			"현재 대기방에 입장할 수 없습니다."
	),
	DEVICE_CHECK_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"DEVICE_CHECK_NOT_FOUND",
			"기기 점검 결과를 찾을 수 없습니다."
	),
	DEVICE_CHECK_NOT_ALLOWED(
			HttpStatus.CONFLICT,
			"DEVICE_CHECK_NOT_ALLOWED",
			"현재 상태에서는 기기 점검 결과를 저장할 수 없습니다."
	),
	DEVICE_CHECK_REQUIRED(
			HttpStatus.CONFLICT,
			"DEVICE_CHECK_REQUIRED",
			"준비 완료 전에 기기 점검이 필요합니다."
	),
	DEVICE_CHECK_FAILED(
			HttpStatus.CONFLICT,
			"DEVICE_CHECK_FAILED",
			"기기 점검의 모든 항목을 통과해야 준비 완료할 수 있습니다."
	),
	ROOM_READY_NOT_ALLOWED(
			HttpStatus.CONFLICT,
			"ROOM_READY_NOT_ALLOWED",
			"현재 상태에서는 준비 상태를 변경할 수 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	RoomErrorCode(HttpStatus status, String code, String message) {
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
