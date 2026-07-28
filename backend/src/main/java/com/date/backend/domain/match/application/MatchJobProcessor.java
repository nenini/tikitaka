package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchSchedulerProperties;
import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.repository.MatchJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class MatchJobProcessor {

	private final MatchJobRepository jobRepository;
	private final MatchCandidateService candidateService;
	private final MatchCreationService creationService;
	private final MatchSchedulerProperties properties;
	private final Clock clock;

	public MatchJobProcessor(
			MatchJobRepository jobRepository,
			MatchCandidateService candidateService,
			MatchCreationService creationService,
			MatchSchedulerProperties properties,
			Clock clock
	) {
		this.jobRepository = jobRepository;
		this.candidateService = candidateService;
		this.creationService = creationService;
		this.properties = properties;
		this.clock = clock;
	}

	@Transactional
	public void process(Long jobId, String workerId) {
		MatchJob job = jobRepository.findByIdForUpdate(jobId)
				.orElseThrow(() -> new IllegalStateException(
						"선점한 매칭 작업을 찾을 수 없습니다."
				));
		if (!job.isOwnedBy(workerId)) {
			throw new IllegalStateException("Worker가 소유하지 않은 매칭 작업입니다.");
		}

		LocalDateTime matchedAt = LocalDateTime.now(clock);
		LocalDateTime acceptDeadlineAt = matchedAt.plusSeconds(
				properties.acceptanceTimeoutSeconds()
		);
		LocalDateTime earliestSessionStart = acceptDeadlineAt.plusSeconds(
				properties.scheduleBufferSeconds()
		);
		Long requestId = job.getMatchRequest().getId();

		candidateService.findBestCandidate(requestId, earliestSessionStart)
				.ifPresent(candidate -> creationService.createMatch(
						requestId,
						candidate.request().getId(),
						matchedAt,
						acceptDeadlineAt,
						earliestSessionStart
				));
		job.complete(LocalDateTime.now(clock));
	}
}
