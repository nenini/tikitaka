package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum AiChatErrorCode implements ErrorCode {
	AI_CHAT_PROFILE_INCOMPLETE(
			HttpStatus.BAD_REQUEST,
			"AI_CHAT_PROFILE_INCOMPLETE",
			"AI 채팅에 필요한 성별 또는 생년월일 정보가 없습니다."
	),
	CHATBOT_PERSONA_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"CHATBOT_PERSONA_NOT_FOUND",
			"AI 채팅 페르소나를 찾을 수 없습니다."
	),
	ACTIVE_CHAT_SESSION_EXISTS(
			HttpStatus.CONFLICT,
			"ACTIVE_CHAT_SESSION_EXISTS",
			"이미 진행 중인 AI 채팅 세션이 있습니다."
	),
	CHAT_SESSION_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"CHAT_SESSION_NOT_FOUND",
			"AI 채팅 세션을 찾을 수 없습니다."
	),
	CHAT_SESSION_FORBIDDEN(
			HttpStatus.FORBIDDEN,
			"CHAT_SESSION_FORBIDDEN",
			"해당 AI 채팅 세션에 접근할 수 없습니다."
	),
	AI_RESPONSE_STREAM_FAILED(
			HttpStatus.BAD_GATEWAY,
			"AI_RESPONSE_STREAM_FAILED",
			"AI 응답을 전송하지 못했습니다."
	),
	CHAT_SESSION_CLOSED(
			HttpStatus.CONFLICT,
			"CHAT_SESSION_CLOSED",
			"종료된 AI 채팅 세션에는 메시지를 저장할 수 없습니다."
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
