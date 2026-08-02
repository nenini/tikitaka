package com.date.backend.domain.notification.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationDomainTest {

	@Test
	void notificationCanBeReadOnlyOnce() {
		Notification notification = new Notification(
				1L,
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:10:1"
		);
		LocalDateTime firstReadAt = LocalDateTime.of(2026, 7, 27, 12, 0);

		notification.read(firstReadAt);
		notification.read(firstReadAt.plusMinutes(1));

		assertThat(notification.isRead()).isTrue();
		assertThat(notification.getReadAt()).isEqualTo(firstReadAt);
	}

	@Test
	void referenceTypeAndIdMustBeProvidedTogether() {
		assertThatThrownBy(() -> new Notification(
				1L,
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				null,
				NotificationPresentation.BELL,
				null
		)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void notificationJobFollowsProcessingLifecycle() {
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 27, 18, 0);
		NotificationJob job = new NotificationJob(
				1L,
				NotificationType.SESSION_REMINDER_1H,
				"세션 시작 안내",
				"세션 시작까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"SESSION_REMINDER_1H:10:1",
				scheduledAt
		);

		job.claim("notification-worker-1", scheduledAt);
		job.complete(scheduledAt.plusSeconds(1));

		assertThat(job.getStatus()).isEqualTo(NotificationJobStatus.COMPLETED);
		assertThat(job.getAttemptCount()).isEqualTo(1);
		assertThat(job.getCompletedAt()).isEqualTo(scheduledAt.plusSeconds(1));
	}

	@Test
	void onlyPendingNotificationJobCanBeCancelled() {
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 27, 18, 0);
		NotificationJob job = new NotificationJob(
				1L,
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"수락 기한 안내",
				"매칭 수락 기한이 곧 만료됩니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_ACCEPTANCE_DEADLINE_SOON:10:1",
				scheduledAt
		);
		job.claim("notification-worker-1", scheduledAt);

		assertThatThrownBy(() -> job.cancel(scheduledAt.plusSeconds(1)))
				.isInstanceOf(IllegalStateException.class);
	}
}
