package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.policy.MatchingPolicyProvider;
import com.date.backend.domain.match.policy.MatchingPolicySnapshot;
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
	private final MatchingPolicyProvider policyProvider;
	private final Clock clock;

	public MatchJobProcessor(
			MatchJobRepository jobRepository,
			MatchCandidateService candidateService,
			MatchCreationService creationService,
			MatchingPolicyProvider policyProvider,
			Clock clock
	) {
		this.jobRepository = jobRepository;
		this.candidateService = candidateService;
		this.creationService = creationService;
		this.policyProvider = policyProvider;
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
		MatchingPolicySnapshot policy = policyProvider.current();
		LocalDateTime maximumAcceptDeadlineAt = matchedAt.plusHours(
				policy.acceptTimeoutHours()
		);
		LocalDateTime earliestSessionStart = matchedAt.plusMinutes(
				(long) policy.minimumAcceptanceWindowMinutes()
						+ policy.minimumPreparationMinutes()
		);
		Long requestId = job.getMatchRequest().getId();

		candidateService.findBestCandidate(
				requestId,
				earliestSessionStart,
				matchedAt,
				policy
		)
				.ifPresent(candidate -> {
					LocalDateTime slotAcceptDeadline = candidate.proposedScheduledAt()
							.minusMinutes(policy.minimumPreparationMinutes());
					LocalDateTime acceptDeadlineAt = slotAcceptDeadline.isBefore(
							maximumAcceptDeadlineAt
					)
							? slotAcceptDeadline
							: maximumAcceptDeadlineAt;
					creationService.createMatch(
						requestId,
						candidate.request().getId(),
						matchedAt,
						acceptDeadlineAt,
						candidate.proposedScheduledAt(),
						policy
					);
				});
		job.complete(LocalDateTime.now(clock));
	}
}
