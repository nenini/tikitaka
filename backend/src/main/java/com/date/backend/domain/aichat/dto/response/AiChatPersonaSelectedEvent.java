package com.date.backend.domain.aichat.dto.response;

public record AiChatPersonaSelectedEvent(
		String personaKey,
		String displayName
) {
}
