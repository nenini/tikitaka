package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchResponse;
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
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchCreationServiceTest {

	private final MatchRequestRepository requestRepository =
			mock(MatchRequestRepository.class);
	private final ActiveMatchRequestRepository activeRequestRepository =
			mock(ActiveMatchRequestRepository.class);
	private final MatchRequestSlotRepository slotRepository =
			mock(MatchRequestSlotRepository.class);
	private final MatchRequestTraitSnapshotRepository traitRepository =
			mock(MatchRequestTraitSnapshotRepository.class);
	private final MatchPairRepository pairRepository = mock(MatchPairRepository.class);
	private final MatchResponseRepository responseRepository =
			mock(MatchResponseRepository.class);
	private final MatchCandidateConstraintRepository constraintRepository =
			mock(MatchCandidateConstraintRepository.class);
	private final UserRepository userRepository = mock(UserRepository.class);
	private final ProfileRepository profileRepository = mock(ProfileRepository.class);
	private final MatchEligibilityPolicy eligibilityPolicy =
			mock(MatchEligibilityPolicy.class);
	private final MatchAvailabilityPolicy availabilityPolicy =
			mock(MatchAvailabilityPolicy.class);
	private final MatchScorePolicy scorePolicy = mock(MatchScorePolicy.class);
	private final ApplicationEventPublisher eventPublisher =
			mock(ApplicationEventPublisher.class);

	private final MatchCreationService service = new MatchCreationService(
			requestRepository,
			activeRequestRepository,
			slotRepository,
			traitRepository,
			pairRepository,
			responseRepository,
			constraintRepository,
			userRepository,
			profileRepository,
			eligibilityPolicy,
			availabilityPolicy,
			scorePolicy,
			eventPublisher
	);

	@Test
	void createsPairResponsesAndChangesBothRequestStatusesAfterRevalidation() {
		MatchRequest first = request(1L, 101L, MatchRequestStatus.WAITING);
		MatchRequest second = request(2L, 102L, MatchRequestStatus.WAITING);
		ActiveMatchRequest firstReservation = reservation(101L, first);
		ActiveMatchRequest secondReservation = reservation(102L, second);
		User firstUser = user(101L);
		User secondUser = user(102L);
		Profile firstProfile = new Profile(101L, "first", Gender.MALE, "서울");
		Profile secondProfile = new Profile(102L, "second", Gender.FEMALE, "서울");
		List<MatchRequestSlot> slots = List.of(slot(first), slot(second));
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime proposedScheduledAt = matchedAt.plusHours(8);
		LocalDateTime deadline = proposedScheduledAt.minusHours(1);

		when(requestRepository.findAllByIdForUpdate(List.of(1L, 2L)))
				.thenReturn(List.of(first, second));
		when(activeRequestRepository.findAllByUserIdForUpdate(List.of(101L, 102L)))
				.thenReturn(List.of(firstReservation, secondReservation));
		when(pairRepository.findAllActiveByParticipantUserIds(
				anyCollection(),
				anyCollection()
		)).thenReturn(List.of());
		when(constraintRepository.areUsersBlocked(101L, 102L)).thenReturn(false);
		when(userRepository.findAllById(List.of(101L, 102L)))
				.thenReturn(List.of(firstUser, secondUser));
		when(profileRepository.findAllById(List.of(101L, 102L)))
				.thenReturn(List.of(firstProfile, secondProfile));
		when(eligibilityPolicy.isEligible(
				first,
				firstUser,
				firstProfile,
				second,
				secondUser,
				secondProfile,
				matchedAt.toLocalDate()
		)).thenReturn(true);
		when(slotRepository.findAllByMatchRequest_IdIn(List.of(1L, 2L)))
				.thenReturn(slots);
		when(availabilityPolicy.findEarliestStart(
				anyCollection(),
				anyCollection(),
				any()
		)).thenReturn(Optional.of(proposedScheduledAt));
		when(traitRepository.findAllByMatchRequest_IdIn(List.of(1L, 2L)))
				.thenReturn(List.of());
		when(scorePolicy.calculate(
				first,
				List.of(),
				second,
				List.of()
		)).thenReturn(new MatchScore(
				new BigDecimal("25.000"),
				new BigDecimal("16.667"),
				new BigDecimal("41.667")
		));
		when(pairRepository.save(any(MatchPair.class)))
				.thenAnswer(invocation -> {
					MatchPair pair = invocation.getArgument(0);
					ReflectionTestUtils.setField(pair, "id", 1000L);
					return pair;
				});

		boolean created = service.createMatch(
				1L,
				2L,
				matchedAt,
				deadline,
				proposedScheduledAt
		);

		assertThat(created).isTrue();
		verify(first).markMatchFound(matchedAt);
		verify(second).markMatchFound(matchedAt);
		verify(pairRepository).save(argThat(
				pair -> pair.getMatchedAt().equals(matchedAt)
						&& pair.getAcceptDeadlineAt().equals(deadline)
						&& pair.getProposedScheduledAt().equals(proposedScheduledAt)
		));
		verify(responseRepository).saveAll(anyCollection());
		verify(eventPublisher).publishEvent(new MatchFoundEvent(
				1000L,
				101L,
				102L,
				matchedAt,
				proposedScheduledAt,
				deadline
		));
	}

	@Test
	void skipsCreationWhenLockedCandidateIsNoLongerWaiting() {
		MatchRequest first = request(1L, 101L, MatchRequestStatus.WAITING);
		MatchRequest second = request(2L, 102L, MatchRequestStatus.MATCH_FOUND);
		when(requestRepository.findAllByIdForUpdate(List.of(1L, 2L)))
				.thenReturn(List.of(first, second));

		boolean created = service.createMatch(
				1L,
				2L,
				LocalDateTime.of(2026, 7, 27, 10, 0),
				LocalDateTime.of(2026, 7, 27, 10, 5),
				LocalDateTime.of(2026, 7, 27, 11, 5)
		);

		assertThat(created).isFalse();
		verify(pairRepository, never()).save(any());
		verify(responseRepository, never()).saveAll(anyCollection());
	}

	private MatchRequest request(
			Long id,
			Long userId,
			MatchRequestStatus status
	) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getId()).thenReturn(id);
		when(request.getUserId()).thenReturn(userId);
		when(request.getStatus()).thenReturn(status);
		return request;
	}

	private ActiveMatchRequest reservation(Long userId, MatchRequest request) {
		ActiveMatchRequest reservation = mock(ActiveMatchRequest.class);
		when(reservation.getUserId()).thenReturn(userId);
		when(reservation.getMatchRequest()).thenReturn(request);
		return reservation;
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
}
