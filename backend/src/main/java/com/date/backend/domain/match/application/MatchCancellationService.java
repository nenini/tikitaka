package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.dto.request.MatchCancellationRequest;
import com.date.backend.domain.match.dto.response.MatchCancellationResponse;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MatchErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;

@Service
public class MatchCancellationService {

	private final MatchPairRepository pairRepository;
	private final ActiveMatchRequestRepository activeRequestRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public MatchCancellationService(
			MatchPairRepository pairRepository,
			ActiveMatchRequestRepository activeRequestRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.pairRepository = pairRepository;
		this.activeRequestRepository = activeRequestRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public MatchCancellationResponse cancel(
			Long matchPairId,
			Long userId,
			MatchCancellationRequest request
	) {
		MatchPair pair = pairRepository.findByIdForUpdate(matchPairId)
				.orElseThrow(() -> new BusinessException(MatchErrorCode.MATCH_NOT_FOUND));
		if (!pair.isParticipant(userId)) {
			throw new BusinessException(MatchErrorCode.MATCH_NOT_PARTICIPANT);
		}
		if (pair.getStatus() != MatchStatus.CONFIRMED) {
			throw new BusinessException(
					MatchErrorCode.MATCH_CANCELLATION_NOT_ALLOWED
			);
		}

		LocalDateTime cancelledAt = LocalDateTime.now(clock);
		if (pair.getScheduledAt() == null
				|| !cancelledAt.isBefore(pair.getScheduledAt())) {
			throw new BusinessException(MatchErrorCode.MATCH_SESSION_ALREADY_STARTED);
		}

		String reason = request == null ? null : request.reason();
		pair.cancel(
				userId,
				cancelledAt,
				reason,
				Duration.ofMinutes(pair.getLateCancellationMinutesSnapshot())
		);
		pair.getRequestA().cancel(cancelledAt, reason);
		pair.getRequestB().cancel(cancelledAt, reason);
		activeRequestRepository.deleteAllByIdInBatch(
				java.util.List.of(pair.getUserAId(), pair.getUserBId())
		);

		Long recipientUserId = pair.getUserAId().equals(userId)
				? pair.getUserBId()
				: pair.getUserAId();
		eventPublisher.publishEvent(new MatchCancelledEvent(
				pair.getId(),
				userId,
				recipientUserId,
				cancelledAt,
				pair.isLateCancellation()
		));
		return MatchCancellationResponse.from(pair);
	}
}
