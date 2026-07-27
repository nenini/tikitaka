package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class MatchJobFailureService {

	private final MatchJobRepository jobRepository;

	public MatchJobFailureService(MatchJobRepository jobRepository) {
		this.jobRepository = jobRepository;
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
		job.fail(error, failedAt);
	}
}
