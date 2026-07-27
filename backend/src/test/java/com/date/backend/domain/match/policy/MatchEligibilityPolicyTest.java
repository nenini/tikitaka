package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.user.domain.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchEligibilityPolicyTest {

	private final MatchEligibilityPolicy policy = new MatchEligibilityPolicy();

	@Test
	void requiresMutualPreferredAgeRanges() {
		LocalDate referenceDate = LocalDate.of(2026, 7, 27);
		MatchRequest first = request(1L, (short) 24, (short) 28);
		MatchRequest second = request(2L, (short) 25, (short) 30);
		User firstUser = user(LocalDate.of(2000, 8, 1));
		User secondUser = user(LocalDate.of(1999, 7, 27));

		assertThat(policy.isEligible(
				first,
				firstUser,
				second,
				secondUser,
				referenceDate
		)).isTrue();
	}

	@Test
	void rejectsWhenOnlyOneUserAcceptsTheOthersAge() {
		LocalDate referenceDate = LocalDate.of(2026, 7, 27);
		MatchRequest first = request(1L, (short) 24, (short) 30);
		MatchRequest second = request(2L, (short) 20, (short) 24);
		User firstUser = user(LocalDate.of(2000, 1, 1));
		User secondUser = user(LocalDate.of(1999, 1, 1));

		assertThat(policy.isEligible(
				first,
				firstUser,
				second,
				secondUser,
				referenceDate
		)).isFalse();
	}

	private MatchRequest request(Long userId, short minAge, short maxAge) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getUserId()).thenReturn(userId);
		when(request.getStatus()).thenReturn(MatchRequestStatus.WAITING);
		when(request.getPreferredAgeMin()).thenReturn(minAge);
		when(request.getPreferredAgeMax()).thenReturn(maxAge);
		return request;
	}

	private User user(LocalDate birthDate) {
		User user = mock(User.class);
		when(user.isActive()).thenReturn(true);
		when(user.getBirthDate()).thenReturn(birthDate);
		return user;
	}
}
