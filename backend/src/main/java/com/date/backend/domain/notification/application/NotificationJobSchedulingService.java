package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;

@Service
public class NotificationJobSchedulingService {

	private final NotificationJobRepository jobRepository;

	public NotificationJobSchedulingService(
			NotificationJobRepository jobRepository
	) {
		this.jobRepository = jobRepository;
	}

	@Transactional
	public void schedule(
			Long userId,
			NotificationType type,
			String title,
			String content,
			NotificationReferenceType referenceType,
			Long referenceId,
			NotificationPresentation presentation,
			String deduplicationKey,
			LocalDateTime scheduledAt
	) {
		if (jobRepository.existsByDeduplicationKey(deduplicationKey)) {
			return;
		}
		jobRepository.save(new NotificationJob(
				userId,
				type,
				title,
				content,
				referenceType,
				referenceId,
				presentation,
				deduplicationKey,
				scheduledAt
		));
	}

	@Transactional
	public void cancelPending(
			NotificationReferenceType referenceType,
			Long referenceId,
			Collection<NotificationType> types,
			LocalDateTime cancelledAt
	) {
		jobRepository.findCancellableForUpdate(
				referenceType,
				referenceId,
				NotificationJobStatus.PENDING,
				types
		).forEach(job -> job.cancel(cancelledAt));
	}
}
