package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationCreationService {

	private final NotificationRepository notificationRepository;

	public NotificationCreationService(NotificationRepository notificationRepository) {
		this.notificationRepository = notificationRepository;
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
		notificationRepository.save(new Notification(
				userId,
				type,
				title,
				content,
				referenceType,
				referenceId,
				presentation,
				deduplicationKey
		));
	}
}
