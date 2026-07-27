package com.date.backend.domain.aichat.integration;

public record AiChatResponseStreamRequest(
		Long userId,
		Long sessionId,
		String userMessage
) {
}
