package com.date.backend.domain.aichat.dto.response;

import com.date.backend.domain.aichat.domain.AiResponseState;

public record AiChatCancelResponse(
		Long sessionId,
		Long userMessageId,
		AiResponseState responseState
) {
}
