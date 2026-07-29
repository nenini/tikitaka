package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchExpirationServiceTest {

	@Test
	void expiresOverduePairAndReturnsRequestsToWaiting() {
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		MatchJobEnqueueService jobEnqueueService =
				mock(MatchJobEnqueueService.class);
		ApplicationEventPublisher eventPublisher =
				mock(ApplicationEventPublisher.class);
		MatchExpirationService service = new MatchExpirationService(
				pairRepository,
				jobEnqueueService,
				eventPublisher
		);
		MatchPair pair = mock(MatchPair.class);
		MatchRequest first = mock(MatchRequest.class);
		MatchRequest second = mock(MatchRequest.class);
		LocalDateTime now = LocalDateTime.of(2026, 7, 27, 10, 0);

		when(pair.getId()).thenReturn(1L);
		when(pair.getStatus()).thenReturn(MatchStatus.PENDING_ACCEPTANCE);
		when(pair.isAcceptanceExpired(now)).thenReturn(true);
		when(pair.getRequestA()).thenReturn(first);
		when(pair.getRequestB()).thenReturn(second);
		when(pair.getUserAId()).thenReturn(10L);
		when(pair.getUserBId()).thenReturn(20L);
		when(pairRepository.findAllByStatusAndAcceptDeadlineAtBefore(
				MatchStatus.PENDING_ACCEPTANCE,
				now
		)).thenReturn(List.of(pair));
		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(pair));

		service.expireOverdue(now);

		verify(pair).expire();
		verify(first).returnToWaiting(now);
		verify(second).returnToWaiting(now);
		verify(jobEnqueueService).enqueue(first);
		verify(jobEnqueueService).enqueue(second);
		ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
		verify(eventPublisher).publishEvent(eventCaptor.capture());
		MatchExpiredEvent expired = (MatchExpiredEvent) eventCaptor.getValue();
		org.assertj.core.api.Assertions.assertThat(expired.matchPairId()).isEqualTo(1L);
		org.assertj.core.api.Assertions.assertThat(expired.userAId()).isEqualTo(10L);
		org.assertj.core.api.Assertions.assertThat(expired.userBId()).isEqualTo(20L);
		org.assertj.core.api.Assertions.assertThat(expired.expiredAt()).isEqualTo(now);
	}
}
