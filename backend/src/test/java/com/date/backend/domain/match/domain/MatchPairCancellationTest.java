package com.date.backend.domain.match.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchPairCancellationTest {

	@Test
	void marksCancellationWithinThresholdAsLate() {
		MatchPair pair = confirmedPair();
		LocalDateTime scheduledAt = pair.getScheduledAt();

		pair.cancel(
				101L,
				scheduledAt.minusHours(12),
				"일정 변경",
				Duration.ofHours(24)
		);

		assertThat(pair.getStatus()).isEqualTo(MatchStatus.CANCELLED);
		assertThat(pair.isLateCancellation()).isTrue();
		assertThat(pair.getCancellationReason()).isEqualTo("일정 변경");
	}

	@Test
	void schedulesSessionShortlyAfterConfirmationRatherThanProposedSlot() {
		MatchRequest first = request(1L, 101L);
		MatchRequest second = request(2L, 102L);
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 9, 0);
		LocalDateTime proposedScheduledAt = matchedAt.plusDays(2);
		MatchPair pair = new MatchPair(
				first,
				second,
				new BigDecimal("25.000"),
				new BigDecimal("25.000"),
				matchedAt.plusMinutes(5),
				proposedScheduledAt,
				matchedAt
		);
		LocalDateTime confirmedAt = matchedAt.plusMinutes(2);

		pair.confirm(confirmedAt);

		assertThat(pair.getScheduledAt()).isEqualTo(
				confirmedAt.plusSeconds(MatchPair.SESSION_START_DELAY_SECONDS)
		);
		assertThat(pair.getScheduledAt()).isNotEqualTo(proposedScheduledAt);
	}

	@Test
	void rejectsCancellationAtOrAfterScheduledTime() {
		MatchPair pair = confirmedPair();

		assertThatThrownBy(() -> pair.cancel(
				101L,
				pair.getScheduledAt(),
				null,
				Duration.ofHours(24)
		)).isInstanceOf(IllegalStateException.class);
	}

	private MatchPair confirmedPair() {
		MatchRequest first = request(1L, 101L);
		MatchRequest second = request(2L, 102L);
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 9, 0);
		MatchPair pair = new MatchPair(
				first,
				second,
				new BigDecimal("25.000"),
				new BigDecimal("25.000"),
				matchedAt.plusMinutes(5),
				matchedAt.plusDays(2),
				matchedAt
		);
		pair.confirm(matchedAt.plusMinutes(2));
		return pair;
	}

	private MatchRequest request(Long id, Long userId) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getId()).thenReturn(id);
		when(request.getUserId()).thenReturn(userId);
		return request;
	}
}
