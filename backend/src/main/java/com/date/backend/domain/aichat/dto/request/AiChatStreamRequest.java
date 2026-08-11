package com.date.backend.domain.aichat.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiChatStreamRequest(
		@NotBlank(message = "사용자 메시지는 필수입니다.")
		@Size(max = 5000, message = "사용자 메시지는 5,000자 이하여야 합니다.")
		String messageText
) {
}
