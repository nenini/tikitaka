package com.date.backend.domain.aichat.dto.response;

import java.util.List;

public record AiChatSessionDetailResponse(
		AiChatSessionSummaryResponse session,
		List<AiChatMessageResponse> messages
) {
}
