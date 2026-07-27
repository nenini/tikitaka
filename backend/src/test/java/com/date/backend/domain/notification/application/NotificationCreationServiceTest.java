package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationRepository;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationCreationServiceTest {

	private final NotificationRepository notificationRepository =
			mock(NotificationRepository.class);
	private final NotificationCreationService service =
			new NotificationCreationService(notificationRepository);

	@Test
	void skipsDuplicatedNotification() {
		when(notificationRepository.existsByDeduplicationKey(
				"MATCH_FOUND:10:101"
		)).thenReturn(true);

		service.create(
				101L,
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:10:101"
		);

		verify(notificationRepository, never()).save(any());
	}
}
