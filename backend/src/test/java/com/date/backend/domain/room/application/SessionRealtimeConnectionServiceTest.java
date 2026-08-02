package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionRealtimeProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionClientConnectionState;
import com.date.backend.domain.room.dto.request.SessionConnectionStateRequest;
import com.date.backend.domain.room.dto.request.SessionHeartbeatRequest;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionRealtimeConnectionServiceTest {
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 29, 21, 0);

	private RoomParticipantRepository participantRepository;
	private ApplicationEventPublisher eventPublisher;
	private RoomParticipant participant;
	private SessionRealtimeConnectionService service;

	@BeforeEach
	void setUp() {
		participantRepository = mock(RoomParticipantRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		participant = mock(RoomParticipant.class);
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(participant));
		service = new SessionRealtimeConnectionService(
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
	void heartbeatIsBoundToAuthenticatedParticipantAndLiveKitSid() {
		service.heartbeat(
				101L,
				15L,
				new SessionHeartbeatRequest("client-a", "PA_101")
		);

		verify(participant).recordHeartbeat("PA_101", "client-a", NOW);
	}

	@Test
	void reconnectingStartsFixedGracePeriodAndPublishesStateChange() {
		when(participant.startReconnecting(
				"PA_101",
				"client-a",
				NOW,
				NOW.plusSeconds(20)
		)).thenReturn(true);

		service.updateConnectionState(
				101L,
				15L,
				new SessionConnectionStateRequest(
						"client-a",
						"PA_101",
						SessionClientConnectionState.RECONNECTING
				)
		);

		verify(participant).startReconnecting(
				"PA_101",
				"client-a",
				NOW,
				NOW.plusSeconds(20)
		);
		verify(eventPublisher).publishEvent(any(Object.class));
	}

	@Test
	void staleClientRequestReturnsConnectionConflict() {
		when(participant.recordReconnected("PA_old", "client-old", NOW))
				.thenThrow(new IllegalStateException("stale"));

		assertThatThrownBy(() -> service.updateConnectionState(
				101L,
				15L,
				new SessionConnectionStateRequest(
						"client-old",
						"PA_old",
						SessionClientConnectionState.RECONNECTED
				)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_CONNECTION_CONFLICT
				)
		);
	}
}
