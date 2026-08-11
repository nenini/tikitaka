package com.date.backend.domain.notification.dto.response;

import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.domain.Notification;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

@Schema(description = "알림 정보")
public record NotificationResponse(
		@Schema(description = "알림 ID", example = "120")
		Long notificationId,

		@Schema(description = "알림 유형", example = "MATCH_FOUND")
		NotificationType type,

		@Schema(description = "알림 제목", example = "새로운 매칭이 성립되었어요")
		String title,

		@Schema(description = "알림 내용")
		String content,

		@Schema(description = "연관 도메인 유형", example = "MATCH_PAIR")
		NotificationReferenceType referenceType,

		@Schema(description = "연관 도메인 ID", example = "35")
		Long referenceId,

		@Schema(description = "알림 표시 방식", example = "BELL_AND_TOAST")
		NotificationPresentation presentation,

		@Schema(description = "읽음 여부", example = "false")
		boolean read,

		@Schema(description = "알림 생성 시각")
		LocalDateTime createdAt,

		@Schema(description = "읽은 시각")
		LocalDateTime readAt
) {
	public static NotificationResponse from(Notification notification) {
		return new NotificationResponse(
				notification.getId(),
				notification.getType(),
				notification.getTitle(),
				notification.getContent(),
				notification.getReferenceType(),
				notification.getReferenceId(),
				notification.getPresentation(),
				notification.isRead(),
				notification.getCreatedAt(),
				notification.getReadAt()
		);
	}
}
