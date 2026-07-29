package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationWorkerProperties;
import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class NotificationJobFailureService {

	private final NotificationJobRepository jobRepository;
	private final NotificationWorkerProperties properties;

	public NotificationJobFailureService(
			NotificationJobRepository jobRepository,
			NotificationWorkerProperties properties
	) {
		this.jobRepository = jobRepository;
		this.properties = properties;
	}

	@Transactional
	public void handle(
			Long jobId,
			String workerId,
			String error,
			LocalDateTime failedAt
	) {
		NotificationJob job = jobRepository.findByIdForUpdate(jobId)
				.orElseThrow(() -> new IllegalArgumentException(
						"알림 작업을 찾을 수 없습니다."
				));
		if (!job.isProcessingBy(workerId)) {
			return;
		}
		if (job.getAttemptCount() >= properties.maxAttempts()) {
			job.fail(error, failedAt);
			return;
		}
		job.reschedule(
				error,
				failedAt.plusSeconds(properties.retryDelaySeconds())
		);
	}
}
