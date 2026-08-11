package com.date.backend.domain.aichat.integration;

import com.date.backend.domain.aichat.domain.ChatMessageSenderType;

public record AiChatHistoryMessage(
		Long sequenceNo,
		ChatMessageSenderType role,
		String content
) {
}
