package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.policy.MatchAvailabilityPolicy;
import com.date.backend.domain.match.policy.MatchEligibilityPolicy;
import com.date.backend.domain.match.policy.MatchScore;
import com.date.backend.domain.match.policy.MatchScorePolicy;
import com.date.backend.domain.match.repository.MatchCandidateConstraintRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchRequestTraitSnapshotRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MatchCandidateService {

	private static final Set<MatchStatus> ACTIVE_MATCH_STATUSES =
			EnumSet.of(MatchStatus.PENDING_ACCEPTANCE, MatchStatus.CONFIRMED);

	private static final Comparator<MatchCandidate> CANDIDATE_ORDER =
			Comparator.comparing(
							(MatchCandidate candidate) -> candidate.score().totalScore(),
							Comparator.reverseOrder()
					)
					.thenComparing(candidate -> candidate.request().getRequestedAt())
					.thenComparing(candidate -> candidate.request().getId());

	private final MatchRequestRepository matchRequestRepository;
	private final MatchRequestSlotRepository slotRepository;
	private final MatchRequestTraitSnapshotRepository traitSnapshotRepository;
	private final MatchPairRepository matchPairRepository;
	private final MatchCandidateConstraintRepository constraintRepository;
	private final UserRepository userRepository;
	private final MatchEligibilityPolicy eligibilityPolicy;
	private final MatchAvailabilityPolicy availabilityPolicy;
	private final MatchScorePolicy scorePolicy;

	public MatchCandidateService(
			MatchRequestRepository matchRequestRepository,
			MatchRequestSlotRepository slotRepository,
			MatchRequestTraitSnapshotRepository traitSnapshotRepository,
			MatchPairRepository matchPairRepository,
			MatchCandidateConstraintRepository constraintRepository,
			UserRepository userRepository,
			MatchEligibilityPolicy eligibilityPolicy,
			MatchAvailabilityPolicy availabilityPolicy,
			MatchScorePolicy scorePolicy
	) {
		this.matchRequestRepository = matchRequestRepository;
		this.slotRepository = slotRepository;
		this.traitSnapshotRepository = traitSnapshotRepository;
		this.matchPairRepository = matchPairRepository;
		this.constraintRepository = constraintRepository;
		this.userRepository = userRepository;
		this.eligibilityPolicy = eligibilityPolicy;
		this.availabilityPolicy = availabilityPolicy;
		this.scorePolicy = scorePolicy;
	}

	@Transactional(readOnly = true)
	public Optional<MatchCandidate> findBestCandidate(
			Long sourceRequestId,
			LocalDateTime earliestSessionStart
	) {
		MatchRequest source = matchRequestRepository.findByIdWithFaceTags(sourceRequestId)
				.orElseThrow(() -> new IllegalArgumentException("매칭 요청을 찾을 수 없습니다."));
		if (source.getStatus() != MatchRequestStatus.WAITING) {
			return Optional.empty();
		}

		List<MatchRequest> candidates = matchRequestRepository
				.findAllByStatusOrderByRequestedAtAscIdAsc(MatchRequestStatus.WAITING)
				.stream()
				.filter(candidate -> !candidate.getId().equals(source.getId()))
				.filter(candidate -> !candidate.getUserId().equals(source.getUserId()))
				.toList();
		if (candidates.isEmpty()) {
			return Optional.empty();
		}

		List<Long> requestIds = new ArrayList<>();
		requestIds.add(source.getId());
		requestIds.addAll(candidates.stream().map(MatchRequest::getId).toList());
		Set<Long> userIds = new HashSet<>();
		userIds.add(source.getUserId());
		candidates.forEach(candidate -> userIds.add(candidate.getUserId()));

		Map<Long, User> usersById = userRepository.findAllById(userIds).stream()
				.collect(Collectors.toMap(User::getId, Function.identity()));
		Map<Long, List<MatchRequestSlot>> slotsByRequestId = groupSlots(
				slotRepository.findAllByMatchRequest_IdIn(requestIds)
		);
		Map<Long, List<MatchRequestTraitSnapshot>> traitsByRequestId = groupTraits(
				traitSnapshotRepository.findAllByMatchRequest_IdIn(requestIds)
		);
		Set<Long> blockedCandidateIds = constraintRepository.findBlockedCandidateUserIds(
				source.getUserId(),
				candidates.stream().map(MatchRequest::getUserId).toList()
		);
		Set<Long> usersWithActiveMatch = activeMatchUserIds(
				matchPairRepository.findAllActiveByParticipantUserIds(
						userIds,
						ACTIVE_MATCH_STATUSES
				)
		);

		User sourceUser = usersById.get(source.getUserId());
		if (sourceUser == null || usersWithActiveMatch.contains(source.getUserId())) {
			return Optional.empty();
		}

		List<MatchRequestSlot> sourceSlots = slotsByRequestId.getOrDefault(
				source.getId(),
				List.of()
		);
		List<MatchRequestTraitSnapshot> sourceTraits = traitsByRequestId.getOrDefault(
				source.getId(),
				List.of()
		);

		return candidates.stream()
				.filter(candidate -> !blockedCandidateIds.contains(candidate.getUserId()))
				.filter(candidate -> !usersWithActiveMatch.contains(candidate.getUserId()))
				.map(candidate -> toCandidate(
						source,
						sourceUser,
						sourceSlots,
						sourceTraits,
						candidate,
						usersById.get(candidate.getUserId()),
						slotsByRequestId.getOrDefault(candidate.getId(), List.of()),
						traitsByRequestId.getOrDefault(candidate.getId(), List.of()),
						earliestSessionStart
				))
				.flatMap(Optional::stream)
				.min(CANDIDATE_ORDER);
	}

	private Optional<MatchCandidate> toCandidate(
			MatchRequest source,
			User sourceUser,
			List<MatchRequestSlot> sourceSlots,
			List<MatchRequestTraitSnapshot> sourceTraits,
			MatchRequest candidate,
			User candidateUser,
			List<MatchRequestSlot> candidateSlots,
			List<MatchRequestTraitSnapshot> candidateTraits,
			LocalDateTime earliestSessionStart
	) {
		if (candidateUser == null || !eligibilityPolicy.isEligible(
				source,
				sourceUser,
				candidate,
				candidateUser,
				earliestSessionStart.toLocalDate()
		)) {
			return Optional.empty();
		}
		return availabilityPolicy.findEarliestStart(
						sourceSlots,
						candidateSlots,
						earliestSessionStart
				)
				.map(start -> {
					MatchScore score = scorePolicy.calculate(
							source,
							sourceTraits,
							candidate,
							candidateTraits
					);
					return new MatchCandidate(candidate, score, start);
				});
	}

	private Map<Long, List<MatchRequestSlot>> groupSlots(
			Collection<MatchRequestSlot> slots
	) {
		return slots.stream().collect(Collectors.groupingBy(
				slot -> slot.getMatchRequest().getId()
		));
	}

	private Map<Long, List<MatchRequestTraitSnapshot>> groupTraits(
			Collection<MatchRequestTraitSnapshot> traits
	) {
		return traits.stream().collect(Collectors.groupingBy(
				trait -> trait.getMatchRequest().getId()
		));
	}

	private Set<Long> activeMatchUserIds(Collection<MatchPair> pairs) {
		Set<Long> userIds = new HashSet<>();
		pairs.forEach(pair -> {
			userIds.add(pair.getUserAId());
			userIds.add(pair.getUserBId());
		});
		return userIds;
	}
}
