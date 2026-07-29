package com.date.backend.domain.aichat.dto.response;

public record AiChatStreamConnectedEvent(
		Long sessionId,
		Long userMessageId
) {
}
