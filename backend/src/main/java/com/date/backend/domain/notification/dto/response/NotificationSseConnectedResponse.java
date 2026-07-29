package com.date.backend.domain.notification.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

@Schema(description = "SSE 연결 완료 이벤트")
public record NotificationSseConnectedResponse(
		@Schema(description = "연결된 사용자 ID", example = "10")
		Long userId,

		@Schema(description = "연결 시각")
		LocalDateTime connectedAt
) {
}
