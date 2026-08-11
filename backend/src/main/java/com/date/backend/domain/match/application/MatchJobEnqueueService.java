package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Set;

@Service
public class MatchJobEnqueueService {

	private static final Set<MatchJobStatus> ACTIVE_JOB_STATUSES =
			EnumSet.of(MatchJobStatus.PENDING, MatchJobStatus.PROCESSING);

	private final MatchJobRepository jobRepository;
	private final Clock clock;

	public MatchJobEnqueueService(MatchJobRepository jobRepository, Clock clock) {
		this.jobRepository = jobRepository;
		this.clock = clock;
	}

	@Transactional
	public void enqueue(MatchRequest matchRequest) {
		if (jobRepository.existsByMatchRequest_IdAndStatusIn(
				matchRequest.getId(),
				ACTIVE_JOB_STATUSES
		)) {
			return;
		}
		jobRepository.save(new MatchJob(
				matchRequest,
				LocalDateTime.now(clock)
		));
	}
}
