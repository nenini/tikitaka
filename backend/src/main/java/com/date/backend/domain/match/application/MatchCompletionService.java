package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchCompletionService {

	private static final Duration SESSION_DURATION = Duration.ofMinutes(35);

	private final MatchPairRepository pairRepository;
	private final ActiveMatchRequestRepository activeRequestRepository;

	public MatchCompletionService(
			MatchPairRepository pairRepository,
			ActiveMatchRequestRepository activeRequestRepository
	) {
		this.pairRepository = pairRepository;
		this.activeRequestRepository = activeRequestRepository;
	}

	@Transactional
	public void completeFinishedSessions(LocalDateTime now) {
		LocalDateTime latestFinishedStart = now.minus(SESSION_DURATION);
		List<Long> pairIds = pairRepository
				.findAllByStatusAndScheduledAtBefore(
						MatchStatus.CONFIRMED,
						latestFinishedStart
				)
				.stream()
				.map(MatchPair::getId)
				.toList();
		for (Long pairId : pairIds) {
			pairRepository.findByIdForUpdate(pairId)
					.filter(pair -> pair.getStatus() == MatchStatus.CONFIRMED)
					.filter(pair -> !pair.getScheduledAt()
							.plus(SESSION_DURATION)
							.isAfter(now))
					.ifPresent(this::complete);
		}
	}

	private void complete(MatchPair pair) {
		LocalDateTime completedAt = pair.getScheduledAt().plus(SESSION_DURATION);
		pair.complete(completedAt);
		pair.getRequestA().complete(completedAt);
		pair.getRequestB().complete(completedAt);
		activeRequestRepository.deleteAllByIdInBatch(
				List.of(pair.getUserAId(), pair.getUserBId())
		);
	}
}
