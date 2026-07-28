package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MatchAvailabilityPolicyTest {

	private final MatchAvailabilityPolicy policy = new MatchAvailabilityPolicy();

	@Test
	void findsEarliestThirtyMinuteIntersectionWithinSevenDays() {
		MatchRequest request = mock(MatchRequest.class);
		List<MatchRequestSlot> first = List.of(new MatchRequestSlot(
				request,
				DayOfWeek.MONDAY,
				LocalTime.of(19, 0),
				LocalTime.of(22, 0)
		));
		List<MatchRequestSlot> second = List.of(new MatchRequestSlot(
				request,
				DayOfWeek.MONDAY,
				LocalTime.of(20, 0),
				LocalTime.of(21, 0)
		));

		assertThat(policy.findEarliestStart(
				first,
				second,
				LocalDateTime.of(2026, 7, 27, 19, 30)
		)).contains(LocalDateTime.of(2026, 7, 27, 20, 0));
	}

	@Test
	void rejectsIntersectionShorterThanThirtyMinutes() {
		MatchRequest request = mock(MatchRequest.class);
		List<MatchRequestSlot> first = List.of(new MatchRequestSlot(
				request,
				DayOfWeek.MONDAY,
				LocalTime.of(19, 0),
				LocalTime.of(20, 0)
		));
		List<MatchRequestSlot> second = List.of(new MatchRequestSlot(
				request,
				DayOfWeek.MONDAY,
				LocalTime.of(19, 45),
				LocalTime.of(20, 10)
		));

		assertThat(policy.findEarliestStart(
				first,
				second,
				LocalDateTime.of(2026, 7, 27, 18, 0)
		)).isEmpty();
	}
}
