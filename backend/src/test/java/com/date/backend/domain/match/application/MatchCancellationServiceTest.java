package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchPolicyProperties;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.dto.request.MatchCancellationRequest;
import com.date.backend.domain.match.dto.response.MatchCancellationResponse;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchCancellationServiceTest {

	@Test
	void cancelsConfirmedMatchAndPublishesEventForPartner() {
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		ActiveMatchRequestRepository activeRequestRepository =
				mock(ActiveMatchRequestRepository.class);
		ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
		Clock clock = Clock.fixed(
				Instant.parse("2026-07-27T01:00:00Z"),
				ZoneId.of("Asia/Seoul")
		);
		MatchCancellationService service = new MatchCancellationService(
				pairRepository,
				activeRequestRepository,
				new MatchPolicyProperties(86_400, 86_400),
				eventPublisher,
				clock
		);
		MatchPair pair = mock(MatchPair.class);
		MatchRequest firstRequest = mock(MatchRequest.class);
		MatchRequest secondRequest = mock(MatchRequest.class);
		LocalDateTime cancelledAt = LocalDateTime.of(2026, 7, 27, 10, 0);

		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(pair));
		when(pair.getId()).thenReturn(1L);
		when(pair.isParticipant(101L)).thenReturn(true);
		when(pair.getStatus()).thenReturn(MatchStatus.CONFIRMED);
		when(pair.getScheduledAt()).thenReturn(cancelledAt.plusDays(1));
		when(pair.getRequestA()).thenReturn(firstRequest);
		when(pair.getRequestB()).thenReturn(secondRequest);
		when(pair.getUserAId()).thenReturn(101L);
		when(pair.getUserBId()).thenReturn(102L);
		when(pair.getCancelledAt()).thenReturn(cancelledAt);
		when(pair.getCancelledBy()).thenReturn(101L);
		when(pair.getCancellationReason()).thenReturn("일정 변경");
		when(pair.isLateCancellation()).thenReturn(true);

		MatchCancellationResponse response = service.cancel(
				1L,
				101L,
				new MatchCancellationRequest("일정 변경")
		);

		verify(pair).cancel(
				101L,
				cancelledAt,
				"일정 변경",
				Duration.ofHours(24)
		);
		verify(firstRequest).cancel(cancelledAt, "일정 변경");
		verify(secondRequest).cancel(cancelledAt, "일정 변경");
		verify(activeRequestRepository).deleteAllByIdInBatch(List.of(101L, 102L));

		ArgumentCaptor<MatchCancelledEvent> eventCaptor =
				ArgumentCaptor.forClass(MatchCancelledEvent.class);
		verify(eventPublisher).publishEvent(eventCaptor.capture());
		assertThat(eventCaptor.getValue()).isEqualTo(new MatchCancelledEvent(
				1L,
				101L,
				102L,
				cancelledAt,
				true
		));
		assertThat(response.cancelledBy()).isEqualTo(101L);
		assertThat(response.lateCancellation()).isTrue();
	}
}
