package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.MatchCandidate;
import com.date.backend.domain.match.application.MatchCandidateService;
import com.date.backend.domain.match.application.MatchCreationService;
import com.date.backend.domain.match.config.MatchSchedulerProperties;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Component
@ConditionalOnProperty(
		prefix = "match.scheduler",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class MatchScheduler {

	private static final Logger log = LoggerFactory.getLogger(MatchScheduler.class);

	private final MatchRequestRepository requestRepository;
	private final MatchCandidateService candidateService;
	private final MatchCreationService creationService;
	private final MatchSchedulerProperties properties;
	private final Clock clock;

	public MatchScheduler(
			MatchRequestRepository requestRepository,
			MatchCandidateService candidateService,
			MatchCreationService creationService,
			MatchSchedulerProperties properties,
			Clock clock
	) {
		this.requestRepository = requestRepository;
		this.candidateService = candidateService;
		this.creationService = creationService;
		this.properties = properties;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${match.scheduler.fixed-delay-ms:10000}",
			initialDelayString = "${match.scheduler.initial-delay-ms:10000}"
	)
	public void matchWaitingRequests() {
		List<MatchRequest> sources = requestRepository
				.findAllByStatusOrderByRequestedAtAscIdAsc(
						MatchRequestStatus.WAITING,
						PageRequest.of(0, properties.batchSize())
				);
		for (MatchRequest source : sources) {
			tryMatch(source.getId());
		}
	}

	private void tryMatch(Long sourceRequestId) {
		LocalDateTime matchedAt = LocalDateTime.now(clock);
		LocalDateTime acceptDeadlineAt = matchedAt.plusSeconds(
				properties.acceptanceTimeoutSeconds()
		);
		LocalDateTime earliestSessionStart = acceptDeadlineAt.plusSeconds(
				properties.scheduleBufferSeconds()
		);

		candidateService.findBestCandidate(sourceRequestId, earliestSessionStart)
				.ifPresent(candidate -> createMatch(
						sourceRequestId,
						candidate,
						matchedAt,
						acceptDeadlineAt,
						earliestSessionStart
				));
	}

	private void createMatch(
			Long sourceRequestId,
			MatchCandidate candidate,
			LocalDateTime matchedAt,
			LocalDateTime acceptDeadlineAt,
			LocalDateTime earliestSessionStart
	) {
		try {
			creationService.createMatch(
					sourceRequestId,
					candidate.request().getId(),
					matchedAt,
					acceptDeadlineAt,
					earliestSessionStart
			);
		} catch (PessimisticLockingFailureException | DataIntegrityViolationException exception) {
			log.debug(
					"Concurrent match creation skipped. sourceRequestId={}, candidateRequestId={}",
					sourceRequestId,
					candidate.request().getId()
			);
		}
	}
}
