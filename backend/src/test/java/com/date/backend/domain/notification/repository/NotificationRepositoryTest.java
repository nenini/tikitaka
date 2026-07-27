package com.date.backend.domain.notification.repository;

import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:notification-repository-test;"
				+ "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class NotificationRepositoryTest {

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private NotificationRepository notificationRepository;

	@Autowired
	private NotificationJobRepository notificationJobRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void notificationAndScheduledJobArePersisted() {
		User user = userRepository.save(new User(
				"notification@example.com",
				"password-hash",
				"알림 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		Notification notification = notificationRepository.save(new Notification(
				user.getId(),
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:10:" + user.getId()
		));
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 27, 18, 0);
		NotificationJob job = notificationJobRepository.save(new NotificationJob(
				user.getId(),
				NotificationType.SESSION_REMINDER_1H,
				"세션 시작 안내",
				"세션 시작까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"SESSION_REMINDER_1H:10:" + user.getId(),
				scheduledAt
		));
		entityManager.flush();
		entityManager.clear();

		Notification foundNotification =
				notificationRepository.findById(notification.getId()).orElseThrow();
		NotificationJob foundJob =
				notificationJobRepository.findById(job.getId()).orElseThrow();

		assertThat(foundNotification.getUserId()).isEqualTo(user.getId());
		assertThat(foundNotification.getType()).isEqualTo(NotificationType.MATCH_FOUND);
		assertThat(foundNotification.isRead()).isFalse();
		assertThat(foundNotification.getCreatedAt()).isNotNull();
		assertThat(foundJob.getStatus()).isEqualTo(NotificationJobStatus.PENDING);
		assertThat(foundJob.getAvailableAt()).isEqualTo(scheduledAt);
		assertThat(notificationRepository.existsByDeduplicationKey(
				foundNotification.getDeduplicationKey()
		)).isTrue();
		assertThat(notificationJobRepository.existsByDeduplicationKey(
				foundJob.getDeduplicationKey()
		)).isTrue();
	}
}
