package com.date.backend.domain.notification.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

@Schema(description = "전체 알림 읽음 처리 결과")
public record ReadAllNotificationsResponse(
		@Schema(description = "이번 요청에서 읽음 처리된 알림 개수", example = "5")
		int updatedCount,

		@Schema(description = "읽음 처리 시각")
		LocalDateTime readAt
) {
}
