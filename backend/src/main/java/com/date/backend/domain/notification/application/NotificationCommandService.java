package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import com.date.backend.domain.notification.dto.response.ReadAllNotificationsResponse;
import com.date.backend.domain.notification.repository.NotificationRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.NotificationErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Service
public class NotificationCommandService {

	private final NotificationRepository notificationRepository;
	private final Clock clock;

	public NotificationCommandService(
			NotificationRepository notificationRepository,
			Clock clock
	) {
		this.notificationRepository = notificationRepository;
		this.clock = clock;
	}

	@Transactional
	public NotificationResponse read(Long userId, Long notificationId) {
		Notification notification = notificationRepository
				.findByIdAndUserId(notificationId, userId)
				.orElseThrow(() -> new BusinessException(
						NotificationErrorCode.NOTIFICATION_NOT_FOUND
				));
		notification.read(now());
		return NotificationResponse.from(notification);
	}

	@Transactional
	public ReadAllNotificationsResponse readAll(Long userId) {
		LocalDateTime readAt = now();
		int updatedCount = notificationRepository.markAllAsRead(userId, readAt);
		return new ReadAllNotificationsResponse(updatedCount, readAt);
	}

	private LocalDateTime now() {
		return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
	}
}
