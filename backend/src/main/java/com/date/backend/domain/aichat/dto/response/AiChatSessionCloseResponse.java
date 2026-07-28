package com.date.backend.domain.aichat.dto.response;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;

import java.time.LocalDateTime;

public record AiChatSessionCloseResponse(
		Long sessionId,
		ChatSessionStatus status,
		LocalDateTime closedAt
) {
	public static AiChatSessionCloseResponse from(AiChatSession session) {
		return new AiChatSessionCloseResponse(
				session.getId(),
				session.getStatus(),
				session.getClosedAt()
		);
	}
}
