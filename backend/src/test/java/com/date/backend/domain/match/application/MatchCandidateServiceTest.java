package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.policy.MatchAvailabilityPolicy;
import com.date.backend.domain.match.policy.MatchEligibilityPolicy;
import com.date.backend.domain.match.policy.MatchScore;
import com.date.backend.domain.match.policy.MatchScorePolicy;
import com.date.backend.domain.match.repository.MatchCandidateConstraintRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchRequestTraitSnapshotRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchCandidateServiceTest {

	@Test
	void excludesBlockedUserAndSelectsHighestScoreCandidate() {
		MatchRequestRepository requestRepository = mock(MatchRequestRepository.class);
		MatchRequestSlotRepository slotRepository = mock(MatchRequestSlotRepository.class);
		MatchRequestTraitSnapshotRepository traitRepository =
				mock(MatchRequestTraitSnapshotRepository.class);
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		MatchCandidateConstraintRepository constraintRepository =
				mock(MatchCandidateConstraintRepository.class);
		UserRepository userRepository = mock(UserRepository.class);
		ProfileRepository profileRepository = mock(ProfileRepository.class);
		MatchEligibilityPolicy eligibilityPolicy = mock(MatchEligibilityPolicy.class);
		MatchAvailabilityPolicy availabilityPolicy = mock(MatchAvailabilityPolicy.class);
		MatchScorePolicy scorePolicy = mock(MatchScorePolicy.class);

		MatchCandidateService service = new MatchCandidateService(
				requestRepository,
				slotRepository,
				traitRepository,
				pairRepository,
				constraintRepository,
				userRepository,
				profileRepository,
				eligibilityPolicy,
				availabilityPolicy,
				scorePolicy
		);

		MatchRequest source = request(1L, 101L, LocalDateTime.of(2026, 7, 27, 9, 0));
		MatchRequest lowerScore = request(
				2L,
				102L,
				LocalDateTime.of(2026, 7, 27, 9, 1)
		);
		MatchRequest blockedHigherScore = request(
				3L,
				103L,
				LocalDateTime.of(2026, 7, 27, 9, 2)
		);
		User sourceUser = user(101L);
		User lowerScoreUser = user(102L);
		User blockedUser = user(103L);
		List<MatchRequestSlot> slots = List.of(
				slot(source),
				slot(lowerScore),
				slot(blockedHigherScore)
		);
		LocalDateTime earliestStart = LocalDateTime.of(2026, 7, 27, 20, 0);

		when(requestRepository.findByIdWithFaceTags(1L)).thenReturn(Optional.of(source));
		when(requestRepository.findAllByStatusOrderByRequestedAtAscIdAsc(
				MatchRequestStatus.WAITING
		)).thenReturn(List.of(source, lowerScore, blockedHigherScore));
		when(userRepository.findAllById(anyCollection()))
				.thenReturn(List.of(sourceUser, lowerScoreUser, blockedUser));
		when(profileRepository.findAllById(anyCollection())).thenReturn(List.of(
				new Profile(101L, "source", Gender.MALE, "서울"),
				new Profile(102L, "candidate", Gender.FEMALE, "서울"),
				new Profile(103L, "blocked", Gender.FEMALE, "서울")
		));
		when(slotRepository.findAllByMatchRequest_IdIn(anyCollection()))
				.thenReturn(slots);
		when(traitRepository.findAllByMatchRequest_IdIn(anyCollection()))
				.thenReturn(List.of());
		when(constraintRepository.findBlockedCandidateUserIds(
				101L,
				List.of(102L, 103L)
		)).thenReturn(Set.of(103L));
		when(pairRepository.findAllActiveByParticipantUserIds(
				anyCollection(),
				anyCollection()
		)).thenReturn(List.of());
		when(eligibilityPolicy.isEligible(
				any(),
				any(),
				any(),
				any(),
				any(),
				any(),
				any()
		)).thenReturn(true);
		when(availabilityPolicy.findEarliestStart(
				anyCollection(),
				anyCollection(),
				any()
		)).thenReturn(Optional.of(earliestStart));
		when(scorePolicy.calculate(
				any(),
				anyCollection(),
				any(),
				anyCollection()
		)).thenReturn(score("40.000"));

		Optional<MatchCandidate> result = service.findBestCandidate(1L, earliestStart);

		assertThat(result)
				.get()
				.satisfies(candidate -> {
					assertThat(candidate.request().getId()).isEqualTo(2L);
					assertThat(candidate.score().totalScore())
							.isEqualByComparingTo("40.000");
					assertThat(candidate.proposedScheduledAt()).isEqualTo(earliestStart);
				});
	}

	private MatchRequest request(Long id, Long userId, LocalDateTime requestedAt) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getId()).thenReturn(id);
		when(request.getUserId()).thenReturn(userId);
		when(request.getStatus()).thenReturn(MatchRequestStatus.WAITING);
		when(request.getRequestedAt()).thenReturn(requestedAt);
		return request;
	}

	private User user(Long id) {
		User user = mock(User.class);
		when(user.getId()).thenReturn(id);
		return user;
	}

	private MatchRequestSlot slot(MatchRequest request) {
		MatchRequestSlot slot = mock(MatchRequestSlot.class);
		when(slot.getMatchRequest()).thenReturn(request);
		return slot;
	}

	private MatchScore score(String total) {
		BigDecimal totalScore = new BigDecimal(total);
		return new MatchScore(BigDecimal.ZERO, totalScore, totalScore);
	}
}
