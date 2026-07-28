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
