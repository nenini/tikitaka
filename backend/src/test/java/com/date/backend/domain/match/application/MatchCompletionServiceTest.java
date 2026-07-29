package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MatchCompletionServiceTest {

	@Test
	void completesSessionAfterThirtyMinutesAndReleasesActiveRequests() {
		MatchPairRepository pairRepository = mock(MatchPairRepository.class);
		ActiveMatchRequestRepository activeRepository =
				mock(ActiveMatchRequestRepository.class);
		MatchCompletionService service =
				new MatchCompletionService(pairRepository, activeRepository);
		MatchPair pair = mock(MatchPair.class);
		MatchRequest first = mock(MatchRequest.class);
		MatchRequest second = mock(MatchRequest.class);
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 29, 10, 0);
		LocalDateTime completedAt = scheduledAt.plusMinutes(30);

		when(pair.getId()).thenReturn(1L);
		when(pair.getStatus()).thenReturn(MatchStatus.CONFIRMED);
		when(pair.getScheduledAt()).thenReturn(scheduledAt);
		when(pair.getRequestA()).thenReturn(first);
		when(pair.getRequestB()).thenReturn(second);
		when(pair.getUserAId()).thenReturn(10L);
		when(pair.getUserBId()).thenReturn(20L);
		when(pairRepository.findAllByStatusAndScheduledAtBefore(
				MatchStatus.CONFIRMED,
				completedAt.minusMinutes(30)
		)).thenReturn(List.of(pair));
		when(pairRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(pair));

		service.completeFinishedSessions(completedAt);

		verify(pair).complete(completedAt);
		verify(first).complete(completedAt);
		verify(second).complete(completedAt);
		verify(activeRepository).deleteAllByIdInBatch(List.of(10L, 20L));
	}
}
