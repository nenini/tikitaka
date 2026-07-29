package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WaitingRoomProvisioningServiceTest {
	private final WaitingRoomRepository sessionRepository =
			mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participantRepository =
			mock(RoomParticipantRepository.class);
	private final ApplicationEventPublisher eventPublisher =
			mock(ApplicationEventPublisher.class);
	private final WaitingRoomProvisioningService service =
			new WaitingRoomProvisioningService(
					sessionRepository,
					participantRepository,
					eventPublisher
			);

	@Test
	void createsOneSessionAndTwoParticipantsForConfirmedMatch() {
		MatchPair pair = pair();
		when(sessionRepository.existsByMatchPair_Id(30L)).thenReturn(false);
		when(sessionRepository.saveAndFlush(any(WaitingRoom.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));

		service.provision(pair);

		verify(sessionRepository).saveAndFlush(any(WaitingRoom.class));
		verify(participantRepository, times(2)).save(any(RoomParticipant.class));
		verify(eventPublisher).publishEvent(any(WaitingRoomCreatedEvent.class));
	}

	@Test
	void duplicateProvisionRequestDoesNotCreateAnotherSession() {
		MatchPair pair = pair();
		when(sessionRepository.existsByMatchPair_Id(30L)).thenReturn(true);

		service.provision(pair);

		verify(sessionRepository, never()).saveAndFlush(any());
		verify(participantRepository, never()).save(any());
		verify(eventPublisher, never()).publishEvent(any());
	}

	private MatchPair pair() {
		MatchPair pair = mock(MatchPair.class);
		when(pair.getId()).thenReturn(30L);
		when(pair.getUserAId()).thenReturn(101L);
		when(pair.getUserBId()).thenReturn(102L);
		when(pair.getScheduledAt())
				.thenReturn(LocalDateTime.of(2026, 7, 30, 19, 0));
		return pair;
	}
}
