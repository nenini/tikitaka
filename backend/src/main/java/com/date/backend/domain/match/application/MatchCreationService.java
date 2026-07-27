package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.MatchResponse;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.policy.MatchAvailabilityPolicy;
import com.date.backend.domain.match.policy.MatchEligibilityPolicy;
import com.date.backend.domain.match.policy.MatchScore;
import com.date.backend.domain.match.policy.MatchScorePolicy;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchCandidateConstraintRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchRequestTraitSnapshotRepository;
import com.date.backend.domain.match.repository.MatchResponseRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MatchCreationService {

	private static final Set<MatchStatus> ACTIVE_MATCH_STATUSES =
			EnumSet.of(MatchStatus.PENDING_ACCEPTANCE, MatchStatus.CONFIRMED);

	private final MatchRequestRepository requestRepository;
	private final ActiveMatchRequestRepository activeRequestRepository;
	private final MatchRequestSlotRepository slotRepository;
	private final MatchRequestTraitSnapshotRepository traitRepository;
	private final MatchPairRepository pairRepository;
	private final MatchResponseRepository responseRepository;
	private final MatchCandidateConstraintRepository constraintRepository;
	private final UserRepository userRepository;
	private final MatchEligibilityPolicy eligibilityPolicy;
	private final MatchAvailabilityPolicy availabilityPolicy;
	private final MatchScorePolicy scorePolicy;

	public MatchCreationService(
			MatchRequestRepository requestRepository,
			ActiveMatchRequestRepository activeRequestRepository,
			MatchRequestSlotRepository slotRepository,
			MatchRequestTraitSnapshotRepository traitRepository,
			MatchPairRepository pairRepository,
			MatchResponseRepository responseRepository,
			MatchCandidateConstraintRepository constraintRepository,
			UserRepository userRepository,
			MatchEligibilityPolicy eligibilityPolicy,
			MatchAvailabilityPolicy availabilityPolicy,
			MatchScorePolicy scorePolicy
	) {
		this.requestRepository = requestRepository;
		this.activeRequestRepository = activeRequestRepository;
		this.slotRepository = slotRepository;
		this.traitRepository = traitRepository;
		this.pairRepository = pairRepository;
		this.responseRepository = responseRepository;
		this.constraintRepository = constraintRepository;
		this.userRepository = userRepository;
		this.eligibilityPolicy = eligibilityPolicy;
		this.availabilityPolicy = availabilityPolicy;
		this.scorePolicy = scorePolicy;
	}

	@Transactional
	public boolean createMatch(
			Long firstRequestId,
			Long secondRequestId,
			LocalDateTime matchedAt,
			LocalDateTime acceptDeadlineAt,
			LocalDateTime earliestSessionStart
	) {
		List<Long> requestIds = List.of(firstRequestId, secondRequestId);
		List<MatchRequest> lockedRequests = requestRepository.findAllByIdForUpdate(
				requestIds
		);
		if (lockedRequests.size() != 2) {
			return false;
		}

		Map<Long, MatchRequest> requestsById = lockedRequests.stream()
				.collect(Collectors.toMap(MatchRequest::getId, Function.identity()));
		MatchRequest first = requestsById.get(firstRequestId);
		MatchRequest second = requestsById.get(secondRequestId);
		if (!areWaitingDistinctRequests(first, second)) {
			return false;
		}

		List<Long> userIds = List.of(first.getUserId(), second.getUserId());
		if (!hasValidActiveReservations(
				activeRequestRepository.findAllByUserIdForUpdate(userIds),
				first,
				second
		)) {
			return false;
		}
		if (!pairRepository.findAllActiveByParticipantUserIds(
				userIds,
				ACTIVE_MATCH_STATUSES
		).isEmpty()) {
			return false;
		}
		if (constraintRepository.areUsersBlocked(first.getUserId(), second.getUserId())) {
			return false;
		}

		Map<Long, User> usersById = userRepository.findAllById(userIds).stream()
				.collect(Collectors.toMap(User::getId, Function.identity()));
		User firstUser = usersById.get(first.getUserId());
		User secondUser = usersById.get(second.getUserId());
		if (firstUser == null || secondUser == null
				|| !eligibilityPolicy.isEligible(
						first,
						firstUser,
						second,
						secondUser,
						matchedAt.toLocalDate()
				)) {
			return false;
		}

		Map<Long, List<MatchRequestSlot>> slotsByRequest = slotRepository
				.findAllByMatchRequest_IdIn(requestIds)
				.stream()
				.collect(Collectors.groupingBy(slot -> slot.getMatchRequest().getId()));
		if (availabilityPolicy.findEarliestStart(
				slotsByRequest.getOrDefault(first.getId(), List.of()),
				slotsByRequest.getOrDefault(second.getId(), List.of()),
				earliestSessionStart
		).isEmpty()) {
			return false;
		}

		Map<Long, List<MatchRequestTraitSnapshot>> traitsByRequest = traitRepository
				.findAllByMatchRequest_IdIn(requestIds)
				.stream()
				.collect(Collectors.groupingBy(
						snapshot -> snapshot.getMatchRequest().getId()
				));
		MatchScore score = scorePolicy.calculate(
				first,
				traitsByRequest.getOrDefault(first.getId(), List.of()),
				second,
				traitsByRequest.getOrDefault(second.getId(), List.of())
		);

		MatchPair pair = pairRepository.save(new MatchPair(
				first,
				second,
				score.faceScore(),
				score.traitScore(),
				acceptDeadlineAt,
				matchedAt
		));
		responseRepository.saveAll(List.of(
				new MatchResponse(pair, first.getUserId()),
				new MatchResponse(pair, second.getUserId())
		));
		first.markMatchFound(matchedAt);
		second.markMatchFound(matchedAt);
		return true;
	}

	private boolean areWaitingDistinctRequests(
			MatchRequest first,
			MatchRequest second
	) {
		return first != null
				&& second != null
				&& !first.getId().equals(second.getId())
				&& !first.getUserId().equals(second.getUserId())
				&& first.getStatus() == MatchRequestStatus.WAITING
				&& second.getStatus() == MatchRequestStatus.WAITING;
	}

	private boolean hasValidActiveReservations(
			Collection<ActiveMatchRequest> reservations,
			MatchRequest first,
			MatchRequest second
	) {
		if (reservations.size() != 2) {
			return false;
		}
		Map<Long, Long> requestIdByUserId = reservations.stream()
				.collect(Collectors.toMap(
						ActiveMatchRequest::getUserId,
						active -> active.getMatchRequest().getId()
				));
		return first.getId().equals(requestIdByUserId.get(first.getUserId()))
				&& second.getId().equals(requestIdByUserId.get(second.getUserId()));
	}
}
