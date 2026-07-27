package com.date.backend.domain.aichat.dto.request;

import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AiChatMessageCreateRequest(
		@NotNull(message = "메시지 발신자 유형은 필수입니다.")
		ChatMessageSenderType senderType,

		@NotBlank(message = "메시지 내용은 필수입니다.")
		@Size(max = 5000, message = "메시지는 5,000자 이하여야 합니다.")
		String messageText,

		boolean proactive
) {
}
