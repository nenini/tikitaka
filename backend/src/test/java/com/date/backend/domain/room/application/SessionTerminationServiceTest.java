package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
	private RoomParticipantRepository participantRepository;
	private LiveKitRoomManager liveKitRoomManager;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoom session;
	private SessionTerminationService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		liveKitRoomManager = mock(LiveKitRoomManager.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		session = mock(WaitingRoom.class);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.getId()).thenReturn(15L);
		when(session.getLivekitRoomName()).thenReturn("date-room-30");
		when(session.isInProgress()).thenReturn(true);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		service = new SessionTerminationService(
				sessionRepository,
				participantRepository,
				liveKitRoomManager,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-29T13:30:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void timerExpirationCompletesSessionAndDeletesLiveKitRoom() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);

		assertThat(service.completeByTimer(15L, ENDED_AT)).isTrue();

		verify(session).complete(
				ENDED_AT,
				SessionTerminationReason.TIME_EXPIRED,
				null
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
				SessionTerminationReason.RECONNECT_TIMEOUT,
				null
		);
		verify(liveKitRoomManager).deleteRoom("date-room-30");
	}

	@Test
	void duplicateTerminationIsIdempotent() {
		when(session.isEnded()).thenReturn(true);
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);
		when(session.getTerminationReason()).thenReturn(
				SessionTerminationReason.TIME_EXPIRED.name()
		);
		when(session.getActualEndAt()).thenReturn(ENDED_AT);

		assertThat(service.completeByTimer(15L, ENDED_AT)).isFalse();

		verify(liveKitRoomManager, never()).deleteRoom(any());
		verify(eventPublisher, never()).publishEvent(any(Object.class));
	}

	@Test
	void participantCompletesSessionAndActorIsStored() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);

		var response = service.complete(101L, 15L);

		verify(session).complete(
				ENDED_AT,
				SessionTerminationReason.NORMAL_COMPLETION,
				101L
		);
		assertThat(response.status()).isEqualTo(RoomSessionStatus.COMPLETED);
		assertThat(response.reason())
				.isEqualTo(SessionTerminationReason.NORMAL_COMPLETION);
		assertThat(response.endedByUserId()).isEqualTo(101L);
	}

	@Test
	void participantTerminatesSessionWithSelectedReason() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.CANCELLED);

		var response = service.terminate(
				101L,
				15L,
				SessionTerminationReason.SAFETY_CONCERN
		);

		verify(session).terminate(
				ENDED_AT,
				SessionTerminationReason.SAFETY_CONCERN,
				101L
		);
		assertThat(response.status()).isEqualTo(RoomSessionStatus.CANCELLED);
		assertThat(response.reason())
				.isEqualTo(SessionTerminationReason.SAFETY_CONCERN);
	}

	@Test
	void repeatedParticipantTerminationReturnsOriginalResult() {
		when(session.isEnded()).thenReturn(true);
		when(session.getStatus()).thenReturn(RoomSessionStatus.CANCELLED);
		when(session.getTerminationReason()).thenReturn(
				SessionTerminationReason.USER_REQUEST.name()
		);
		when(session.getEndedByUserId()).thenReturn(102L);
		when(session.getActualEndAt()).thenReturn(ENDED_AT.minusMinutes(1));

		var response = service.terminate(
				101L,
				15L,
				SessionTerminationReason.OTHER
		);

		assertThat(response.reason())
				.isEqualTo(SessionTerminationReason.USER_REQUEST);
		assertThat(response.endedByUserId()).isEqualTo(102L);
		assertThat(response.endedAt()).isEqualTo(ENDED_AT.minusMinutes(1));
		verify(liveKitRoomManager, never()).deleteRoom(any());
		verify(eventPublisher, never()).publishEvent(any(Object.class));
	}

	@Test
	void nonParticipantCannotTerminateSession() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 999L))
				.thenReturn(false);

		assertThatThrownBy(() -> service.terminate(
				999L,
				15L,
				SessionTerminationReason.USER_REQUEST
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_NOT_PARTICIPANT
				)
		);

		verify(liveKitRoomManager, never()).deleteRoom(any());
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
