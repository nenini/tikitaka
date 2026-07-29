package com.date.backend.domain.aichat.dto.request;

import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import jakarta.validation.constraints.NotNull;

public record AiChatSessionCreateRequest(
		@NotNull(message = "채팅 목적은 필수입니다.")
		ChatSessionPurpose purpose
) {
}
