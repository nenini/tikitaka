package com.date.backend.domain.notification.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "커서 기반 알림 목록")
public record NotificationListResponse(
		@Schema(description = "알림 목록")
		List<NotificationResponse> notifications,

		@Schema(
				description = "다음 페이지 조회용 커서. 다음 페이지가 없으면 null",
				example = "101"
		)
		Long nextCursor,

		@Schema(description = "다음 페이지 존재 여부", example = "true")
		boolean hasNext
) {
}
