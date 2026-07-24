package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AiChatErrorCode implements ErrorCode {
	CHATBOT_PERSONA_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"CHATBOT_PERSONA_NOT_FOUND",
			"AI 채팅 페르소나를 찾을 수 없습니다."
	),
	ACTIVE_CHAT_SESSION_EXISTS(
			HttpStatus.CONFLICT,
			"ACTIVE_CHAT_SESSION_EXISTS",
			"이미 진행 중인 AI 채팅 세션이 있습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	AiChatErrorCode(HttpStatus status, String code, String message) {
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
