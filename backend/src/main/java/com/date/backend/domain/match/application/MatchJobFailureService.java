package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.repository.MatchJobRepository;
import com.date.backend.domain.match.policy.MatchJobRetryPolicy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class MatchJobFailureService {

	private final MatchJobRepository jobRepository;
	private final MatchJobRetryPolicy retryPolicy;

	public MatchJobFailureService(
			MatchJobRepository jobRepository,
			MatchJobRetryPolicy retryPolicy
	) {
		this.jobRepository = jobRepository;
		this.retryPolicy = retryPolicy;
	}

	@Transactional
	public void fail(Long jobId, String workerId, String error, LocalDateTime failedAt) {
		MatchJob job = jobRepository.findByIdForUpdate(jobId)
				.orElseThrow(() -> new IllegalStateException(
						"실패 처리할 매칭 작업을 찾을 수 없습니다."
				));
		if (!job.isOwnedBy(workerId)) {
			return;
		}
		if (retryPolicy.canRetry(job.getAttemptCount())) {
			job.reschedule(
					error,
					retryPolicy.nextAvailableAt(job.getAttemptCount(), failedAt)
			);
		} else {
			job.fail(error, failedAt);
		}
	}
}
