package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.dto.response.NotificationListResponse;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import com.date.backend.domain.notification.dto.response.UnreadNotificationCountResponse;
import com.date.backend.domain.notification.repository.NotificationRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NotificationQueryService {

	private static final int MAX_PAGE_SIZE = 100;

	private final NotificationRepository notificationRepository;

	public NotificationQueryService(
			NotificationRepository notificationRepository
	) {
		this.notificationRepository = notificationRepository;
	}

	@Transactional(readOnly = true)
	public NotificationListResponse getNotifications(
			Long userId,
			Long cursor,
			int size
	) {
		validateCursorAndSize(cursor, size);
		List<Notification> fetched = notificationRepository.findPageByUserId(
				userId,
				cursor,
				PageRequest.of(0, size + 1)
		);
		boolean hasNext = fetched.size() > size;
		List<Notification> page = hasNext
				? fetched.subList(0, size)
				: fetched;
		List<NotificationResponse> notifications = page.stream()
				.map(this::toResponse)
				.toList();
		Long nextCursor = hasNext && !page.isEmpty()
				? page.get(page.size() - 1).getId()
				: null;
		return new NotificationListResponse(
				notifications,
				nextCursor,
				hasNext
		);
	}

	@Transactional(readOnly = true)
	public UnreadNotificationCountResponse getUnreadCount(Long userId) {
		return new UnreadNotificationCountResponse(
				notificationRepository.countByUserIdAndReadFalse(userId)
		);
	}

	private void validateCursorAndSize(Long cursor, int size) {
		if (cursor != null && cursor <= 0) {
			throw new IllegalArgumentException("커서는 0보다 커야 합니다.");
		}
		if (size <= 0 || size > MAX_PAGE_SIZE) {
			throw new IllegalArgumentException(
					"조회 크기는 1 이상 " + MAX_PAGE_SIZE + " 이하여야 합니다."
			);
		}
	}

	private NotificationResponse toResponse(Notification notification) {
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
