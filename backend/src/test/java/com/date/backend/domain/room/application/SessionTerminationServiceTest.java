package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionTerminationServiceTest {
	private static final LocalDateTime ENDED_AT =
			LocalDateTime.of(2026, 7, 29, 22, 30);

	private WaitingRoomRepository sessionRepository;
	private LiveKitRoomManager liveKitRoomManager;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoom session;
	private SessionTerminationService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		liveKitRoomManager = mock(LiveKitRoomManager.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		session = mock(WaitingRoom.class);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.getId()).thenReturn(15L);
		when(session.getLivekitRoomName()).thenReturn("date-room-30");
		when(session.isInProgress()).thenReturn(true);
		service = new SessionTerminationService(
				sessionRepository,
				liveKitRoomManager,
				eventPublisher
		);
	}

	@Test
	void timerExpirationCompletesSessionAndDeletesLiveKitRoom() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);

		assertThat(service.completeByTimer(15L, ENDED_AT)).isTrue();

		verify(session).complete(
				ENDED_AT,
				SessionTerminationReason.TIME_EXPIRED
		);
		verify(liveKitRoomManager).deleteRoom("date-room-30");
		verify(eventPublisher).publishEvent(any(Object.class));
	}

	@Test
	void reconnectTimeoutCancelsSessionAndDeletesLiveKitRoom() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.CANCELLED);

		assertThat(service.terminateForConnectionFailure(
				15L,
				SessionTerminationReason.RECONNECT_TIMEOUT,
				ENDED_AT
		)).isTrue();

		verify(session).terminate(
				ENDED_AT,
				SessionTerminationReason.RECONNECT_TIMEOUT
		);
		verify(liveKitRoomManager).deleteRoom("date-room-30");
	}

	@Test
	void duplicateTerminationIsIdempotent() {
		when(session.isEnded()).thenReturn(true);

		assertThat(service.completeByTimer(15L, ENDED_AT)).isFalse();

		verify(liveKitRoomManager, never()).deleteRoom(any());
		verify(eventPublisher, never()).publishEvent(any(Object.class));
	}

	@Test
	void sessionBeforeStartCannotBeTerminatedByRealtimePolicy() {
		when(session.isInProgress()).thenReturn(false);

		assertThatThrownBy(() -> service.terminateForConnectionFailure(
				15L,
				SessionTerminationReason.RECONNECT_TIMEOUT,
				ENDED_AT
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_STATE_CONFLICT
				)
		);
	}

	@Test
	void liveKitDeletionFailureStopsTerminationEventPublication() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);
		doThrow(new IllegalStateException("LiveKit unavailable"))
				.when(liveKitRoomManager)
				.deleteRoom("date-room-30");

		assertThatThrownBy(() -> service.completeByTimer(15L, ENDED_AT))
				.isInstanceOf(IllegalStateException.class);

		verify(eventPublisher, never()).publishEvent(any(Object.class));
	}
}
