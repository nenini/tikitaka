package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationWorkerProperties;
import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationJobWorkerServiceTest {

	private static final ZoneId ZONE_ID = ZoneId.of("Asia/Seoul");
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 28, 10, 0);
	private static final String WORKER_ID = "notification-worker-test";

	@Test
	void processorCreatesNotificationAndCompletesClaimedJob() {
		NotificationJobRepository jobRepository =
				mock(NotificationJobRepository.class);
		NotificationCreationService creationService =
				mock(NotificationCreationService.class);
		NotificationJob job = job();
		job.claim(WORKER_ID, NOW);
		when(jobRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(job));
		NotificationJobProcessor processor = new NotificationJobProcessor(
				jobRepository,
				creationService,
				fixedClock()
		);

		processor.process(1L, WORKER_ID);

		verify(creationService).create(
				101L,
				NotificationType.SESSION_REMINDER_1H,
				"세션 시작 안내",
				"세션 시작까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"SESSION_REMINDER_1H:10:101"
		);
		assertThat(job.getStatus()).isEqualTo(NotificationJobStatus.COMPLETED);
		assertThat(job.getCompletedAt()).isEqualTo(NOW);
	}

	@Test
	void failedJobIsRescheduledUntilMaximumAttempts() {
		NotificationJobRepository jobRepository =
				mock(NotificationJobRepository.class);
		NotificationWorkerProperties properties =
				new NotificationWorkerProperties(20, 3, 5, 60);
		NotificationJobFailureService service =
				new NotificationJobFailureService(jobRepository, properties);
		NotificationJob job = job();
		when(jobRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(job));

		job.claim(WORKER_ID, NOW);
		service.handle(1L, WORKER_ID, "첫 번째 실패", NOW);

		assertThat(job.getStatus()).isEqualTo(NotificationJobStatus.PENDING);
		assertThat(job.getAvailableAt()).isEqualTo(NOW.plusSeconds(5));

		job.claim(WORKER_ID, NOW.plusSeconds(5));
		service.handle(1L, WORKER_ID, "두 번째 실패", NOW.plusSeconds(5));
		job.claim(WORKER_ID, NOW.plusSeconds(10));
		service.handle(1L, WORKER_ID, "세 번째 실패", NOW.plusSeconds(10));

		assertThat(job.getStatus()).isEqualTo(NotificationJobStatus.FAILED);
		assertThat(job.getAttemptCount()).isEqualTo(3);
		assertThat(job.getFailedAt()).isEqualTo(NOW.plusSeconds(10));
	}

	private NotificationJob job() {
		return new NotificationJob(
				101L,
				NotificationType.SESSION_REMINDER_1H,
				"세션 시작 안내",
				"세션 시작까지 1시간 남았습니다.",
				NotificationReferenceType.MATCH_PAIR,
				10L,
				NotificationPresentation.BELL_AND_TOAST,
				"SESSION_REMINDER_1H:10:101",
				NOW
		);
	}

	private Clock fixedClock() {
		return Clock.fixed(
				Instant.parse("2026-07-28T01:00:00Z"),
				ZONE_ID
		);
	}
}
