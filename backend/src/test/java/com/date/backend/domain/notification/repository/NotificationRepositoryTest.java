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
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

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

	@Test
	void dueJobsCanBeClaimedAndPendingJobsCanBeCancelledByReference() {
		User user = userRepository.save(new User(
				"notification-worker@example.com",
				"password-hash",
				"알림 작업 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		LocalDateTime now = LocalDateTime.of(2026, 7, 28, 10, 0);
		NotificationJob dueJob = notificationJobRepository.save(new NotificationJob(
				user.getId(),
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"수락 마감 안내",
				"수락 마감까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				20L,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_ACCEPTANCE_DEADLINE_SOON:20:" + user.getId(),
				now.minusMinutes(1)
		));
		NotificationJob futureJob = notificationJobRepository.save(new NotificationJob(
				user.getId(),
				NotificationType.SESSION_REMINDER_1H,
				"세션 시작 안내",
				"세션 시작까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				20L,
				NotificationPresentation.BELL_AND_TOAST,
				"SESSION_REMINDER_1H:20:" + user.getId(),
				now.plusHours(1)
		));
		entityManager.flush();

		List<NotificationJob> claimable =
				notificationJobRepository.findClaimableForUpdate(
						NotificationJobStatus.PENDING,
						now,
						PageRequest.of(0, 20)
				);
		List<NotificationJob> cancellable =
				notificationJobRepository.findCancellableForUpdate(
						NotificationReferenceType.MATCH_PAIR,
						20L,
						NotificationJobStatus.PENDING,
						List.of(NotificationType.SESSION_REMINDER_1H)
				);

		assertThat(claimable).extracting(NotificationJob::getId)
				.containsExactly(dueJob.getId());
		assertThat(cancellable).extracting(NotificationJob::getId)
				.containsExactly(futureJob.getId());
	}
}
