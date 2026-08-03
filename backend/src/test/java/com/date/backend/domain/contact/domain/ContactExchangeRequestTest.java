package com.date.backend.domain.contact.domain;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ContactExchangeRequestTest {
	private static final LocalDateTime REQUESTED_AT =
			LocalDateTime.of(2026, 7, 31, 20, 30);

	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		MatchPair matchPair = mock(MatchPair.class);
		when(matchPair.getId()).thenReturn(10L);
		when(matchPair.getScheduledAt()).thenReturn(REQUESTED_AT);
		session = new WaitingRoom(matchPair);
	}

	@Test
	void bothAgreementsCompleteMutualDecision() {
		ContactExchangeRequest request = new ContactExchangeRequest(
				session,
				1L,
				2L,
				ContactDecision.AGREE,
				REQUESTED_AT
		);

		assertThat(request.recordDecision(
				2L,
				ContactDecision.AGREE,
				REQUESTED_AT.plusSeconds(10)
		)).isTrue();

		assertThat(request.getStatus())
				.isEqualTo(ContactDecisionStatus.AGREED);
		assertThat(request.requesterDecision())
				.isEqualTo(ContactDecision.AGREE);
		assertThat(request.targetDecision())
				.isEqualTo(ContactDecision.AGREE);
		assertThat(request.getRespondedAt())
				.isEqualTo(REQUESTED_AT.plusSeconds(10));
	}

	@Test
	void oneDeclineCompletesDecisionAsDeclined() {
		ContactExchangeRequest request = new ContactExchangeRequest(
				session,
				1L,
				2L,
				ContactDecision.AGREE,
				REQUESTED_AT
		);

		request.recordDecision(
				2L,
				ContactDecision.DECLINE,
				REQUESTED_AT.plusSeconds(10)
		);

		assertThat(request.getStatus())
				.isEqualTo(ContactDecisionStatus.DECLINED);
	}

	@Test
	void sameDecisionIsIdempotentButChangingItIsRejected() {
		ContactExchangeRequest request = new ContactExchangeRequest(
				session,
				1L,
				2L,
				ContactDecision.AGREE,
				REQUESTED_AT
		);

		assertThat(request.recordDecision(
				1L,
				ContactDecision.AGREE,
				REQUESTED_AT.plusSeconds(1)
		)).isFalse();

		assertThatThrownBy(() -> request.recordDecision(
				1L,
				ContactDecision.DECLINE,
				REQUESTED_AT.plusSeconds(2)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_EXTENSION_DECISION_CONFLICT
				)
		);
	}
}
