package com.date.backend.domain.aichat.dto.response;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;

import java.time.LocalDateTime;

public record AiChatSessionSummaryResponse(
		Long sessionId,
		String aiPersonaKey,
		ChatSessionPurpose purpose,
		ChatSessionStatus status,
		AiResponseState aiResponseState,
		Long pendingUserMessageId,
		String lastAiResponseErrorCode,
		String lastMessage,
		long messageCount,
		LocalDateTime createdAt,
		LocalDateTime closedAt
) {
	public static AiChatSessionSummaryResponse from(
			AiChatSession session,
			String lastMessage,
			long messageCount
	) {
		return new AiChatSessionSummaryResponse(
				session.getId(),
				session.getAiPersonaKey(),
				session.getPurpose(),
				session.getStatus(),
				session.getAiResponseState(),
				session.getPendingUserMessageId(),
				session.getLastAiResponseErrorCode(),
				lastMessage,
				messageCount,
				session.getCreatedAt(),
				session.getClosedAt()
		);
	}
}
