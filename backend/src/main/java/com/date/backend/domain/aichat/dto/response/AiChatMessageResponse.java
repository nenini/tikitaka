package com.date.backend.domain.aichat.dto.response;

import com.date.backend.domain.aichat.domain.AiChatMessage;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;

import java.time.LocalDateTime;

public record AiChatMessageResponse(
		Long messageId,
		ChatMessageSenderType senderType,
		String messageText,
		Long sequenceNo,
		boolean proactive,
		LocalDateTime createdAt
) {
	public static AiChatMessageResponse from(AiChatMessage message) {
		return new AiChatMessageResponse(
				message.getId(),
				message.getSenderType(),
				message.getMessageText(),
				message.getSequenceNo(),
				message.isProactive(),
				message.getCreatedAt()
		);
	}
}
