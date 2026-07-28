package com.date.backend.domain.notification.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "미확인 알림 개수")
public record UnreadNotificationCountResponse(
		@Schema(description = "미확인 알림 개수", example = "3")
		long unreadCount
) {
}
