package com.date.backend.domain.aichat.dto.response;

public record AiChatStreamChunkEvent(
		long sequence,
		String content
) {
}
