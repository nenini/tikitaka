package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchSchedulerProperties;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchResponse;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.dto.response.MatchResultResponse;
import com.date.backend.domain.match.policy.MatchAvailabilityPolicy;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchResponseRepository;
import com.date.backend.domain.profile.application.ProfileService;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchResultServiceTest {

	private static final Long PAIR_ID = 1L;
	private static final Long USER_A_ID = 101L;
	private static final Long USER_B_ID = 102L;
	private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 27, 10, 0);

	private final MatchPairRepository pairRepository = mock(MatchPairRepository.class);
	private final MatchResponseRepository responseRepository =
			mock(MatchResponseRepository.class);
	private final MatchRequestSlotRepository slotRepository =
			mock(MatchRequestSlotRepository.class);
	private final MatchAvailabilityPolicy availabilityPolicy =
			mock(MatchAvailabilityPolicy.class);
	private final ProfileService profileService = mock(ProfileService.class);
	private final Clock clock = Clock.fixed(
			Instant.parse("2026-07-27T01:00:00Z"),
			ZoneId.of("Asia/Seoul")
	);
	private final MatchSchedulerProperties properties = new MatchSchedulerProperties(
			10_000,
			10_000,
			100,
			300,
			3_600
	);
	private final MatchResultService service = new MatchResultService(
			pairRepository,
			responseRepository,
			slotRepository,
			availabilityPolicy,
			profileService,
			properties,
			clock
	);

	@Test
	void confirmsPairAndRequestsWhenBothUsersAccept() {
		MatchPair pair = pair(MatchStatus.PENDING_ACCEPTANCE);
		MatchRequest requestA = pair.getRequestA();
		MatchRequest requestB = pair.getRequestB();
		MatchResponse responseA = new MatchResponse(pair, USER_A_ID);
		MatchResponse responseB = new MatchResponse(pair, USER_B_ID);
		responseA.accept(NOW.minusMinutes(1));
		LocalDateTime scheduledAt = NOW.plusHours(2);

		when(pairRepository.findByIdForUpdate(PAIR_ID)).thenReturn(Optional.of(pair));
		when(responseRepository.findForUpdateByMatchPair_IdAndUserId(
				PAIR_ID,
				USER_B_ID
		)).thenReturn(Optional.of(responseB));
		when(responseRepository.findAllByMatchPair_IdOrderByUserIdAsc(PAIR_ID))
				.thenReturn(List.of(responseA, responseB));
		when(slotRepository.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(
				requestA.getId()
		)).thenReturn(List.of());
		when(slotRepository.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(
				requestB.getId()
		)).thenReturn(List.of());
		when(availabilityPolicy.findEarliestStart(
				anyCollection(),
				anyCollection(),
				eq(NOW.plusHours(1))
		)).thenReturn(Optional.of(scheduledAt));
		when(profileService.getPublicProfile(USER_A_ID))
				.thenReturn(mock(PublicProfileResponse.class));

		MatchResultResponse result = service.accept(PAIR_ID, USER_B_ID);

		verify(pair).confirm(NOW, scheduledAt);
		verify(requestA).confirm();
		verify(requestB).confirm();
		assertThat(result.myResponse().name()).isEqualTo("ACCEPTED");
	}

	@Test
	void rejectsPairAndReturnsBothRequestsToWaiting() {
		MatchPair pair = pair(MatchStatus.PENDING_ACCEPTANCE);
		MatchRequest requestA = pair.getRequestA();
		MatchRequest requestB = pair.getRequestB();
		MatchResponse responseA = new MatchResponse(pair, USER_A_ID);
		MatchResponse responseB = new MatchResponse(pair, USER_B_ID);

		when(pairRepository.findByIdForUpdate(PAIR_ID)).thenReturn(Optional.of(pair));
		when(responseRepository.findForUpdateByMatchPair_IdAndUserId(
				PAIR_ID,
				USER_A_ID
		)).thenReturn(Optional.of(responseA));
		when(responseRepository.findAllByMatchPair_IdOrderByUserIdAsc(PAIR_ID))
				.thenReturn(List.of(responseA, responseB));
		when(profileService.getPublicProfile(USER_B_ID))
				.thenReturn(mock(PublicProfileResponse.class));

		MatchResultResponse result = service.reject(PAIR_ID, USER_A_ID);

		verify(pair).reject();
		verify(requestA).returnToWaiting();
		verify(requestB).returnToWaiting();
		assertThat(result.myResponse().name()).isEqualTo("REJECTED");
	}

	private MatchPair pair(MatchStatus status) {
		MatchRequest requestA = request(11L);
		MatchRequest requestB = request(12L);
		MatchPair pair = mock(MatchPair.class);
		when(pair.getId()).thenReturn(PAIR_ID);
		when(pair.getRequestA()).thenReturn(requestA);
		when(pair.getRequestB()).thenReturn(requestB);
		when(pair.getUserAId()).thenReturn(USER_A_ID);
		when(pair.getUserBId()).thenReturn(USER_B_ID);
		when(pair.getStatus()).thenReturn(status);
		when(pair.isParticipant(USER_A_ID)).thenReturn(true);
		when(pair.isParticipant(USER_B_ID)).thenReturn(true);
		when(pair.isAcceptanceExpired(NOW)).thenReturn(false);
		when(pair.getFaceScore()).thenReturn(new BigDecimal("25.000"));
		when(pair.getTraitScore()).thenReturn(new BigDecimal("25.000"));
		when(pair.getTotalScore()).thenReturn(new BigDecimal("50.000"));
		when(pair.getAcceptDeadlineAt()).thenReturn(NOW.plusMinutes(5));
		when(pair.getMatchedAt()).thenReturn(NOW.minusMinutes(1));
		return pair;
	}

	private MatchRequest request(Long id) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getId()).thenReturn(id);
		return request;
	}
}
