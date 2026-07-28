package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchWorkerProperties;
import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchJobClaimService {

	private final MatchJobRepository jobRepository;
	private final MatchWorkerProperties properties;

	public MatchJobClaimService(
			MatchJobRepository jobRepository,
			MatchWorkerProperties properties
	) {
		this.jobRepository = jobRepository;
		this.properties = properties;
	}

	@Transactional
	public List<ClaimedMatchJob> claim(
			String workerId,
			LocalDateTime claimedAt
	) {
		List<MatchJob> jobs = jobRepository.findClaimableForUpdate(
				MatchJobStatus.PENDING,
				claimedAt,
				PageRequest.of(0, properties.batchSize())
		);
		jobs.forEach(job -> job.claim(workerId, claimedAt));
		return jobs.stream()
				.map(job -> new ClaimedMatchJob(
						job.getId(),
						job.getMatchRequest().getId()
				))
				.toList();
	}
}
