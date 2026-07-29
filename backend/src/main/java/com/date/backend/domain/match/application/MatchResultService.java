package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchResponse;
import com.date.backend.domain.match.domain.MatchResponseStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.dto.response.MatchResultResponse;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchResponseRepository;
import com.date.backend.domain.profile.application.ProfileService;
import com.date.backend.domain.room.application.WaitingRoomProvisioningService;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MatchErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class MatchResultService {

	private static final Set<MatchStatus> CURRENT_MATCH_STATUSES =
			EnumSet.of(MatchStatus.PENDING_ACCEPTANCE, MatchStatus.CONFIRMED);

	private final MatchPairRepository pairRepository;
	private final MatchResponseRepository responseRepository;
	private final ActiveMatchRequestRepository activeRequestRepository;
	private final ProfileService profileService;
	private final Clock clock;
	private final MatchJobEnqueueService jobEnqueueService;
	private final WaitingRoomProvisioningService waitingRoomProvisioningService;
	private final WaitingRoomRepository waitingRoomRepository;
	private final ApplicationEventPublisher eventPublisher;

	public MatchResultService(
			MatchPairRepository pairRepository,
			MatchResponseRepository responseRepository,
			ActiveMatchRequestRepository activeRequestRepository,
			ProfileService profileService,
			Clock clock,
			MatchJobEnqueueService jobEnqueueService,
			WaitingRoomProvisioningService waitingRoomProvisioningService,
			WaitingRoomRepository waitingRoomRepository,
			ApplicationEventPublisher eventPublisher
	) {
		this.pairRepository = pairRepository;
		this.responseRepository = responseRepository;
		this.activeRequestRepository = activeRequestRepository;
		this.profileService = profileService;
		this.clock = clock;
		this.jobEnqueueService = jobEnqueueService;
		this.waitingRoomProvisioningService = waitingRoomProvisioningService;
		this.waitingRoomRepository = waitingRoomRepository;
		this.eventPublisher = eventPublisher;
	}

	public MatchResultResponse getCurrent(Long userId) {
		MatchPair pair = pairRepository.findCurrentByParticipant(
						userId,
						CURRENT_MATCH_STATUSES,
						PageRequest.of(0, 1)
				)
				.stream()
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_NOT_FOUND
				));
		return toResponse(pair, userId);
	}

	@Transactional
	public MatchResultResponse accept(Long matchPairId, Long userId) {
		LocalDateTime now = LocalDateTime.now(clock);
		MatchPair pair = getPairForResponse(matchPairId, userId, now);
		getPendingResponse(pair.getId(), userId).accept(now);

		List<MatchResponse> responses = responseRepository
				.findAllByMatchPair_IdOrderByUserIdAsc(pair.getId());
		if (responses.size() == 2 && responses.stream().allMatch(
				response -> response.getResponse() == MatchResponseStatus.ACCEPTED
		)) {
			confirm(pair, now);
		}
		return toResponse(pair, userId);
	}

	@Transactional
	public MatchResultResponse reject(Long matchPairId, Long userId) {
		LocalDateTime now = LocalDateTime.now(clock);
		MatchPair pair = getPairForResponse(matchPairId, userId, now);
		getPendingResponse(pair.getId(), userId).reject(now);
		pair.reject(now);
		MatchRequest rejectedRequest = pair.getUserAId().equals(userId)
				? pair.getRequestA()
				: pair.getRequestB();
		MatchRequest waitingRequest = pair.getUserAId().equals(userId)
				? pair.getRequestB()
				: pair.getRequestA();
		rejectedRequest.reject(now);
		waitingRequest.returnToWaiting(now);
		activeRequestRepository.deleteById(userId);
		jobEnqueueService.enqueue(waitingRequest);
		Long recipientUserId = pair.getUserAId().equals(userId)
				? pair.getUserBId()
				: pair.getUserAId();
		eventPublisher.publishEvent(new MatchRejectedEvent(
				pair.getId(),
				userId,
				recipientUserId,
				now
		));
		return toResponse(pair, userId);
	}

	private MatchPair getPairForResponse(
			Long matchPairId,
			Long userId,
			LocalDateTime now
	) {
		MatchPair pair = pairRepository.findByIdForUpdate(matchPairId)
				.orElseThrow(() -> new BusinessException(MatchErrorCode.MATCH_NOT_FOUND));
		if (!pair.isParticipant(userId)) {
			throw new BusinessException(MatchErrorCode.MATCH_NOT_PARTICIPANT);
		}
		if (pair.getStatus() != MatchStatus.PENDING_ACCEPTANCE) {
			throw new BusinessException(MatchErrorCode.MATCH_NOT_RESPONDABLE);
		}
		if (pair.isAcceptanceExpired(now)) {
			throw new BusinessException(
					MatchErrorCode.MATCH_ACCEPTANCE_DEADLINE_EXPIRED
			);
		}
		return pair;
	}

	private MatchResponse getPendingResponse(Long matchPairId, Long userId) {
		MatchResponse response = responseRepository
				.findForUpdateByMatchPair_IdAndUserId(matchPairId, userId)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_NOT_PARTICIPANT
				));
		if (response.getResponse() != MatchResponseStatus.PENDING) {
			throw new BusinessException(
					MatchErrorCode.MATCH_RESPONSE_ALREADY_PROCESSED
			);
		}
		return response;
	}

	private void confirm(MatchPair pair, LocalDateTime confirmedAt) {
		MatchRequest first = pair.getRequestA();
		MatchRequest second = pair.getRequestB();
		pair.confirm(confirmedAt);
		first.confirm();
		second.confirm();
		waitingRoomProvisioningService.provision(pair);
		eventPublisher.publishEvent(new MatchConfirmedEvent(
				pair.getId(),
				pair.getUserAId(),
				pair.getUserBId(),
				confirmedAt,
				pair.getProposedScheduledAt()
		));
	}

	private MatchResultResponse toResponse(MatchPair pair, Long userId) {
		List<MatchResponse> responses = responseRepository
				.findAllByMatchPair_IdOrderByUserIdAsc(pair.getId());
		MatchResponseStatus myResponse = responseStatus(responses, userId);
		Long partnerId = pair.getUserAId().equals(userId)
				? pair.getUserBId()
				: pair.getUserAId();
		MatchResponseStatus partnerResponse = responseStatus(responses, partnerId);
		return new MatchResultResponse(
				pair.getId(),
				waitingRoomRepository.findByMatchPair_Id(pair.getId())
						.map(room -> room.getId())
						.orElse(null),
				pair.getStatus(),
				myResponse,
				partnerResponse,
				profileService.getPublicProfile(partnerId),
				pair.getFaceScore(),
				pair.getTraitScore(),
				pair.getTotalScore(),
				pair.getAcceptDeadlineAt(),
				pair.getMatchedAt(),
				pair.getProposedScheduledAt(),
				pair.getScheduledAt(),
				pair.getConfirmedAt()
		);
	}

	private MatchResponseStatus responseStatus(
			List<MatchResponse> responses,
			Long userId
	) {
		return responses.stream()
				.filter(response -> response.getUserId().equals(userId))
				.map(MatchResponse::getResponse)
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_NOT_PARTICIPANT
				));
	}
}
