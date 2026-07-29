package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import com.date.backend.domain.notification.repository.NotificationRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationCreationService {

	private final NotificationRepository notificationRepository;
	private final ApplicationEventPublisher eventPublisher;

	public NotificationCreationService(
			NotificationRepository notificationRepository,
			ApplicationEventPublisher eventPublisher
	) {
		this.notificationRepository = notificationRepository;
		this.eventPublisher = eventPublisher;
	}

	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void create(
			Long userId,
			NotificationType type,
			String title,
			String content,
			NotificationReferenceType referenceType,
			Long referenceId,
			NotificationPresentation presentation,
			String deduplicationKey
	) {
		if (notificationRepository.existsByDeduplicationKey(deduplicationKey)) {
			return;
		}
		Notification notification = notificationRepository.save(new Notification(
				userId,
				type,
				title,
				content,
				referenceType,
				referenceId,
				presentation,
				deduplicationKey
		));
		eventPublisher.publishEvent(new NotificationCreatedEvent(
				userId,
				NotificationResponse.from(notification)
		));
	}
}
