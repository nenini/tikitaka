package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionRealtimeProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.event.SessionAbnormalTerminationRequestedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionConnectionMonitorServiceTest {
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 29, 21, 0);

	private RoomParticipantRepository participantRepository;
	private ApplicationEventPublisher eventPublisher;
	private RoomParticipant participant;
	private SessionConnectionMonitorService service;

	@BeforeEach
	void setUp() {
		participantRepository = mock(RoomParticipantRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		participant = mock(RoomParticipant.class);
		service = new SessionConnectionMonitorService(
				participantRepository,
				new SessionRealtimeProperties(
						Duration.ofSeconds(15),
						Duration.ofSeconds(20),
						false,
						5_000,
						5_000,
						100
				),
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-29T12:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void missingHeartbeatChangesConnectedParticipantToReconnecting() {
		when(participantRepository.findHeartbeatTimedOutForUpdate(
				eq(SessionConnectionStatus.CONNECTED),
				eq(NOW.minusSeconds(15)),
				any(Pageable.class)
		)).thenReturn(List.of(participant));
		when(participant.startReconnecting(NOW, NOW.plusSeconds(20)))
				.thenReturn(true);

		int changed = service.detectHeartbeatTimeouts();

		assertThat(changed).isEqualTo(1);
		verify(participant).startReconnecting(NOW, NOW.plusSeconds(20));
		verify(eventPublisher).publishEvent(any(Object.class));
	}

	@Test
	void expiredReconnectPublishesAbnormalTerminationRequest() {
		when(participantRepository.findReconnectExpiredForUpdate(
				eq(SessionConnectionStatus.RECONNECTING),
				eq(NOW),
				any(Pageable.class)
		)).thenReturn(List.of(participant));
		when(participant.failRecovery(NOW)).thenReturn(true);
		when(participant.getRoomId()).thenReturn(15L);
		when(participant.getUserId()).thenReturn(101L);

		int changed = service.failExpiredRecoveries();

		assertThat(changed).isEqualTo(1);
		ArgumentCaptor<Object> eventCaptor =
				ArgumentCaptor.forClass(Object.class);
		verify(eventPublisher, org.mockito.Mockito.times(2))
				.publishEvent(eventCaptor.capture());
		assertThat(eventCaptor.getAllValues())
				.anySatisfy(event -> assertThat(event)
						.isInstanceOf(
								SessionAbnormalTerminationRequestedEvent.class
						));
	}
}
