package com.date.backend.domain.notification.scheduler;

import com.date.backend.domain.notification.application.NotificationJobClaimService;
import com.date.backend.domain.notification.application.NotificationJobFailureService;
import com.date.backend.domain.notification.application.NotificationJobProcessor;
import com.date.backend.domain.notification.application.NotificationJobRecoveryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Component
@ConditionalOnProperty(
		prefix = "notification.worker",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class NotificationJobWorker {

	private static final Logger log =
			LoggerFactory.getLogger(NotificationJobWorker.class);

	private final NotificationJobClaimService claimService;
	private final NotificationJobProcessor processor;
	private final NotificationJobFailureService failureService;
	private final NotificationJobRecoveryService recoveryService;
	private final Clock clock;
	private final String workerId = "notification-worker-" + UUID.randomUUID();

	public NotificationJobWorker(
			NotificationJobClaimService claimService,
			NotificationJobProcessor processor,
			NotificationJobFailureService failureService,
			NotificationJobRecoveryService recoveryService,
			Clock clock
	) {
		this.claimService = claimService;
		this.processor = processor;
		this.failureService = failureService;
		this.recoveryService = recoveryService;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${notification.worker.fixed-delay-ms:1000}",
			initialDelayString = "${notification.worker.initial-delay-ms:10000}"
	)
	public void processJobs() {
		LocalDateTime now = LocalDateTime.now(clock);
		recoveryService.recoverStale(now);
		for (Long jobId : claimService.claim(workerId, now)) {
			process(jobId);
		}
	}

	private void process(Long jobId) {
		try {
			processor.process(jobId, workerId);
		} catch (Exception exception) {
			log.warn("Notification job failed. jobId={}", jobId, exception);
			try {
				failureService.handle(
						jobId,
						workerId,
						exception.getMessage(),
						LocalDateTime.now(clock)
				);
			} catch (Exception failureException) {
				log.error(
						"Failed to record notification job failure. jobId={}",
						jobId,
						failureException
				);
			}
		}
	}
}
