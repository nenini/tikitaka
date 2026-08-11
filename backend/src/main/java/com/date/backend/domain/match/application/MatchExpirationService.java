package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MatchExpirationService {
	private static final Logger log = LoggerFactory.getLogger(MatchExpirationService.class);

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
			// **건별로 격리한다.** 예전에는 한 건이 던지면 트랜잭션이 통째로 롤백돼
			// 나머지 만료도 전부 막혔고, 그 행이 안 지워져 10초마다 같은 예외가
			// 반복됐다(운영 로그). 만료는 건끼리 독립이므로 하나가 실패해도 나머지는
			// 처리돼야 한다.
			try {
				pairRepository.findByIdForUpdate(pairId)
						.filter(pair -> pair.getStatus() == MatchStatus.PENDING_ACCEPTANCE)
						.filter(pair -> pair.isAcceptanceExpired(now))
						.ifPresent(pair -> expire(pair, now));
			} catch (RuntimeException exception) {
				log.warn("Match expiration skipped. pairId={}, reason={}",
						pairId, exception.toString());
			}
		}
	}

	private void expire(MatchPair pair, LocalDateTime waitingStartedAt) {
		pair.expire(waitingStartedAt);
		returnToWaiting(pair.getRequestA(), waitingStartedAt);
		returnToWaiting(pair.getRequestB(), waitingStartedAt);
		eventPublisher.publishEvent(new MatchExpiredEvent(
				pair.getId(),
				pair.getUserAId(),
				pair.getUserBId(),
				waitingStartedAt
		));
	}

	/**
	 * 아직 상대를 기다리는 요청만 대기로 되돌린다.
	 *
	 * <p>짝은 PENDING_ACCEPTANCE 인데 요청 한쪽이 이미 다른 상태로 넘어간 경우가 있다
	 * (사용자가 취소했거나 별도 경로로 종료됨). 예전에는 무조건 returnToWaiting 을
	 * 불러서 IllegalStateException("상대가 정해진 요청만 대기 상태로 복귀할 수
	 * 있습니다.")이 났고, 그게 스케줄러를 10초마다 실패시켰다.
	 *
	 * <p>짝을 만료하는 것과 요청을 대기로 되돌리는 것은 별개다 — 취소한 사용자를
	 * 다시 대기열에 넣으면 안 되지만, 만료된 짝은 정리돼야 한다.
	 */
	private void returnToWaiting(MatchRequest request, LocalDateTime waitingStartedAt) {
		if (request.getStatus() != MatchRequestStatus.MATCH_FOUND) {
			log.info("Match request left as is. requestId={}, status={}",
					request.getId(), request.getStatus());
			return;
		}
		request.returnToWaiting(waitingStartedAt);
		jobEnqueueService.enqueue(request);
	}
}
