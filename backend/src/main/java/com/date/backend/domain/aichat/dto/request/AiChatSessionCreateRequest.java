package com.date.backend.domain.aichat.dto.request;

import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record AiChatSessionCreateRequest(
		@NotNull(message = "AI 페르소나 ID는 필수입니다.")
		@Positive(message = "AI 페르소나 ID는 양수여야 합니다.")
		Long personaId,

		@NotNull(message = "채팅 목적은 필수입니다.")
		ChatSessionPurpose purpose
) {
}
