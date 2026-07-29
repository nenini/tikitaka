package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationWorkerProperties;
import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class NotificationJobRecoveryService {

	private static final String RECOVERY_MESSAGE =
			"처리 시간이 초과되어 알림 작업을 다시 대기열에 등록합니다.";

	private final NotificationJobRepository jobRepository;
	private final NotificationWorkerProperties properties;

	public NotificationJobRecoveryService(
			NotificationJobRepository jobRepository,
			NotificationWorkerProperties properties
	) {
		this.jobRepository = jobRepository;
		this.properties = properties;
	}

	@Transactional
	public void recoverStale(LocalDateTime now) {
		LocalDateTime claimedBefore = now.minusSeconds(
				properties.processingTimeoutSeconds()
		);
		for (NotificationJob job : jobRepository.findStaleProcessingForUpdate(
				NotificationJobStatus.PROCESSING,
				claimedBefore,
				PageRequest.of(0, properties.batchSize())
		)) {
			if (job.getAttemptCount() >= properties.maxAttempts()) {
				job.fail(RECOVERY_MESSAGE, now);
			} else {
				job.reschedule(
						RECOVERY_MESSAGE,
						now.plusSeconds(properties.retryDelaySeconds())
				);
			}
		}
	}
}
