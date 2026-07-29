package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationWorkerProperties;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class NotificationJobClaimService {

	private final NotificationJobRepository jobRepository;
	private final NotificationWorkerProperties properties;

	public NotificationJobClaimService(
			NotificationJobRepository jobRepository,
			NotificationWorkerProperties properties
	) {
		this.jobRepository = jobRepository;
		this.properties = properties;
	}

	@Transactional
	public List<Long> claim(String workerId, LocalDateTime now) {
		return jobRepository.findClaimableForUpdate(
						NotificationJobStatus.PENDING,
						now,
						PageRequest.of(0, properties.batchSize())
				).stream()
				.peek(job -> job.claim(workerId, now))
				.map(job -> job.getId())
				.toList();
	}
}
