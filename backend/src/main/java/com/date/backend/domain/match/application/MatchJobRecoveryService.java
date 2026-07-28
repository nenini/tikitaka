package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchWorkerProperties;
import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.policy.MatchJobRetryPolicy;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchJobRecoveryService {

	private static final String RECOVERY_ERROR =
			"Worker 처리 제한 시간을 초과하여 작업을 복구했습니다.";

	private final MatchJobRepository jobRepository;
	private final MatchJobRetryPolicy retryPolicy;
	private final MatchWorkerProperties properties;

	public MatchJobRecoveryService(
			MatchJobRepository jobRepository,
			MatchJobRetryPolicy retryPolicy,
			MatchWorkerProperties properties
	) {
		this.jobRepository = jobRepository;
		this.retryPolicy = retryPolicy;
		this.properties = properties;
	}

	@Transactional
	public void recoverStale(LocalDateTime now) {
		LocalDateTime claimedBefore = now.minusSeconds(
				properties.processingTimeoutSeconds()
		);
		List<MatchJob> staleJobs = jobRepository.findStaleProcessingForUpdate(
				MatchJobStatus.PROCESSING,
				claimedBefore,
				PageRequest.of(0, properties.batchSize())
		);
		for (MatchJob job : staleJobs) {
			if (retryPolicy.canRetry(job.getAttemptCount())) {
				job.reschedule(
						RECOVERY_ERROR,
						retryPolicy.nextAvailableAt(job.getAttemptCount(), now)
				);
			} else {
				job.fail(RECOVERY_ERROR, now);
			}
		}
	}
}
