package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchExpirationService {

	private final MatchPairRepository pairRepository;

	public MatchExpirationService(MatchPairRepository pairRepository) {
		this.pairRepository = pairRepository;
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
					.ifPresent(this::expire);
		}
	}

	private void expire(MatchPair pair) {
		pair.expire();
		pair.getRequestA().returnToWaiting();
		pair.getRequestB().returnToWaiting();
	}
}
