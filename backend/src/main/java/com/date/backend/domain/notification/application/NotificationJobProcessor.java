package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class NotificationJobProcessor {

	private final NotificationJobRepository jobRepository;
	private final NotificationCreationService notificationCreationService;
	private final Clock clock;

	public NotificationJobProcessor(
			NotificationJobRepository jobRepository,
			NotificationCreationService notificationCreationService,
			Clock clock
	) {
		this.jobRepository = jobRepository;
		this.notificationCreationService = notificationCreationService;
		this.clock = clock;
	}

	@Transactional
	public void process(Long jobId, String workerId) {
		NotificationJob job = jobRepository.findByIdForUpdate(jobId)
				.orElseThrow(() -> new IllegalArgumentException(
						"알림 작업을 찾을 수 없습니다."
				));
		if (!job.isProcessingBy(workerId)) {
			throw new IllegalStateException(
					"현재 Worker가 점유한 알림 작업이 아닙니다."
			);
		}

		notificationCreationService.create(
				job.getUserId(),
				job.getType(),
				job.getTitle(),
				job.getContent(),
				job.getReferenceType(),
				job.getReferenceId(),
				job.getPresentation(),
				job.getDeduplicationKey()
		);
		job.complete(LocalDateTime.now(clock));
	}
}
