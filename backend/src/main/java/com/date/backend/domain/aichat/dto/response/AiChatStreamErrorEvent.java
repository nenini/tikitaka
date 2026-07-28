package com.date.backend.domain.aichat.dto.response;

public record AiChatStreamErrorEvent(
		String code,
		String message
) {
}
