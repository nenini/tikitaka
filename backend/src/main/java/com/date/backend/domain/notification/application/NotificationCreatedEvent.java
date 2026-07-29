package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.dto.response.NotificationResponse;

public record NotificationCreatedEvent(
		Long userId,
		NotificationResponse notification
) {
}
