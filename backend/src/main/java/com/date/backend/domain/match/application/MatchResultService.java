package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchSchedulerProperties;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchResponse;
import com.date.backend.domain.match.domain.MatchResponseStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.dto.response.MatchResultResponse;
import com.date.backend.domain.match.policy.MatchAvailabilityPolicy;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchResponseRepository;
import com.date.backend.domain.profile.application.ProfileService;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MatchErrorCode;
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
	private final MatchRequestSlotRepository slotRepository;
	private final MatchAvailabilityPolicy availabilityPolicy;
	private final ProfileService profileService;
	private final MatchSchedulerProperties properties;
	private final Clock clock;

	public MatchResultService(
			MatchPairRepository pairRepository,
			MatchResponseRepository responseRepository,
			MatchRequestSlotRepository slotRepository,
			MatchAvailabilityPolicy availabilityPolicy,
			ProfileService profileService,
			MatchSchedulerProperties properties,
			Clock clock
	) {
		this.pairRepository = pairRepository;
		this.responseRepository = responseRepository;
		this.slotRepository = slotRepository;
		this.availabilityPolicy = availabilityPolicy;
		this.profileService = profileService;
		this.properties = properties;
		this.clock = clock;
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
		pair.reject();
		pair.getRequestA().returnToWaiting();
		pair.getRequestB().returnToWaiting();
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
		LocalDateTime earliestStart = confirmedAt.plusSeconds(
				properties.scheduleBufferSeconds()
		);
		LocalDateTime scheduledAt = availabilityPolicy.findEarliestStart(
						slotRepository.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(
								first.getId()
						),
						slotRepository.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(
								second.getId()
						),
						earliestStart
				)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_SCHEDULE_NOT_AVAILABLE
				));
		pair.confirm(confirmedAt, scheduledAt);
		first.confirm();
		second.confirm();
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
				pair.getStatus(),
				myResponse,
				partnerResponse,
				profileService.getPublicProfile(partnerId),
				pair.getFaceScore(),
				pair.getTraitScore(),
				pair.getTotalScore(),
				pair.getAcceptDeadlineAt(),
				pair.getMatchedAt(),
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
