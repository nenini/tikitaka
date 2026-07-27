package com.date.backend.domain.aichat.integration;

import com.date.backend.domain.aichat.domain.ChatSessionPurpose;

import java.util.List;

public record AiChatResponseStreamRequest(
		Long userId,
		Long sessionId,
		ChatSessionPurpose purpose,
		AiChatPersonaCondition personaCondition,
		String selectedPersonaKey,
		List<AiChatHistoryMessage> history
) {
}
