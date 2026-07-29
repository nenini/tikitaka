package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchExpirationService {

	private final MatchPairRepository pairRepository;
	private final MatchJobEnqueueService jobEnqueueService;
	private final ApplicationEventPublisher eventPublisher;

	public MatchExpirationService(
			MatchPairRepository pairRepository,
			MatchJobEnqueueService jobEnqueueService,
			ApplicationEventPublisher eventPublisher
	) {
		this.pairRepository = pairRepository;
		this.jobEnqueueService = jobEnqueueService;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public void expireOverdue(LocalDateTime now) {
		List<Long> overduePairIds = pairRepository
				.findAllByStatusAndAcceptDeadlineAtBefore(
						MatchStatus.PENDING_ACCEPTANCE,
						now
				)
				.stream()
				.map(MatchPair::getId)
				.toList();
		for (Long pairId : overduePairIds) {
			pairRepository.findByIdForUpdate(pairId)
					.filter(pair -> pair.getStatus() == MatchStatus.PENDING_ACCEPTANCE)
					.filter(pair -> pair.isAcceptanceExpired(now))
					.ifPresent(pair -> expire(pair, now));
		}
	}

	private void expire(MatchPair pair, LocalDateTime waitingStartedAt) {
		pair.expire(waitingStartedAt);
		pair.getRequestA().returnToWaiting(waitingStartedAt);
		pair.getRequestB().returnToWaiting(waitingStartedAt);
		jobEnqueueService.enqueue(pair.getRequestA());
		jobEnqueueService.enqueue(pair.getRequestB());
		eventPublisher.publishEvent(new MatchExpiredEvent(
				pair.getId(),
				pair.getUserAId(),
				pair.getUserBId(),
				waitingStartedAt
		));
	}
}
