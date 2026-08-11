package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
		// 대기 복귀는 아직 상대를 기다리는 요청만 대상이다.
		when(first.getStatus()).thenReturn(MatchRequestStatus.MATCH_FOUND);
		when(second.getStatus()).thenReturn(MatchRequestStatus.MATCH_FOUND);
		when(pair.getUserAId()).thenReturn(10L);
		when(pair.getUserBId()).thenReturn(20L);
		when(pairRepository.findAllByStatusAndAcceptDeadlineAtBefore(
				MatchStatus.PENDING_ACCEPTANCE,
				now
		)).thenReturn(List.of(pair));
		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(pair));

		service.expireOverdue(now);

		verify(pair).expire(now);
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

	@Test
	void expiresPairEvenWhenOneRequestAlreadyLeftMatchFound() {
		// 운영 로그: 짝은 PENDING_ACCEPTANCE 인데 요청 한쪽이 이미 다른 상태였다.
		// 예전에는 무조건 returnToWaiting 을 불러 IllegalStateException 이 났고,
		// @Transactional 이 통째로 롤백돼 그 행이 안 지워진 채 10초마다 반복됐다.
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		MatchJobEnqueueService jobEnqueueService = mock(MatchJobEnqueueService.class);
		ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
		MatchExpirationService service = new MatchExpirationService(
				pairRepository, jobEnqueueService, eventPublisher);
		MatchPair pair = mock(MatchPair.class);
		MatchRequest healthy = mock(MatchRequest.class);
		MatchRequest cancelled = mock(MatchRequest.class);
		LocalDateTime now = LocalDateTime.of(2026, 8, 7, 10, 0);

		when(pair.getId()).thenReturn(1L);
		when(pair.getStatus()).thenReturn(MatchStatus.PENDING_ACCEPTANCE);
		when(pair.isAcceptanceExpired(now)).thenReturn(true);
		when(pair.getRequestA()).thenReturn(healthy);
		when(pair.getRequestB()).thenReturn(cancelled);
		when(healthy.getStatus()).thenReturn(MatchRequestStatus.MATCH_FOUND);
		when(cancelled.getStatus()).thenReturn(MatchRequestStatus.CANCELLED);
		when(pairRepository.findAllByStatusAndAcceptDeadlineAtBefore(
				MatchStatus.PENDING_ACCEPTANCE, now)).thenReturn(List.of(pair));
		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(pair));

		service.expireOverdue(now);

		// 짝은 만료된다 — 이게 안 되면 그 행이 영원히 남아 스케줄러를 계속 실패시킨다.
		verify(pair).expire(now);
		// 아직 기다리던 쪽만 대기로 돌아간다. 취소한 사용자를 대기열에 다시 넣으면 안 된다.
		verify(healthy).returnToWaiting(now);
		verify(jobEnqueueService).enqueue(healthy);
		verify(cancelled, never()).returnToWaiting(any());
		verify(jobEnqueueService, never()).enqueue(cancelled);
	}

	@Test
	void oneBadPairDoesNotBlockTheRest() {
		// 건별 격리 — 예전에는 첫 건이 던지면 나머지 만료가 전부 막혔다.
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		MatchJobEnqueueService jobEnqueueService = mock(MatchJobEnqueueService.class);
		ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
		MatchExpirationService service = new MatchExpirationService(
				pairRepository, jobEnqueueService, eventPublisher);
		MatchPair broken = mock(MatchPair.class);
		MatchPair good = mock(MatchPair.class);
		MatchRequest first = mock(MatchRequest.class);
		MatchRequest second = mock(MatchRequest.class);
		LocalDateTime now = LocalDateTime.of(2026, 8, 7, 10, 0);

		when(broken.getId()).thenReturn(1L);
		when(good.getId()).thenReturn(2L);
		when(pairRepository.findAllByStatusAndAcceptDeadlineAtBefore(
				MatchStatus.PENDING_ACCEPTANCE, now)).thenReturn(List.of(broken, good));

		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(broken));
		when(broken.getStatus()).thenReturn(MatchStatus.PENDING_ACCEPTANCE);
		when(broken.isAcceptanceExpired(now)).thenReturn(true);
		doThrow(new IllegalStateException("깨진 행")).when(broken).expire(now);

		when(pairRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(good));
		when(good.getStatus()).thenReturn(MatchStatus.PENDING_ACCEPTANCE);
		when(good.isAcceptanceExpired(now)).thenReturn(true);
		when(good.getRequestA()).thenReturn(first);
		when(good.getRequestB()).thenReturn(second);
		when(first.getStatus()).thenReturn(MatchRequestStatus.MATCH_FOUND);
		when(second.getStatus()).thenReturn(MatchRequestStatus.MATCH_FOUND);

		service.expireOverdue(now);

		verify(good).expire(now);
	}
}
