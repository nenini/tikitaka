package com.date.backend.domain.aichat.dto.response;

public record AiChatStreamDoneEvent(
		Long sessionId,
		Long aiMessageId,
		Long messageSequence
) {
}
