package com.date.backend.domain.aichat.dto.response;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.domain.ConversationStage;

import java.time.LocalDateTime;

public record AiChatSessionCreateResponse(
		Long sessionId,
		String aiPersonaKey,
		ChatSessionPurpose purpose,
		ConversationStage stage,
		ChatSessionStatus status,
		LocalDateTime createdAt
) {
	public static AiChatSessionCreateResponse from(AiChatSession session) {
		return new AiChatSessionCreateResponse(
				session.getId(),
				session.getAiPersonaKey(),
				session.getPurpose(),
				session.getStage(),
				session.getStatus(),
				session.getCreatedAt()
		);
	}
}
