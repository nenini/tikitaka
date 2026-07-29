package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionNetworkQuality;
import com.date.backend.domain.room.dto.request.SessionMediaStateRequest;
import com.date.backend.domain.room.dto.request.SessionNetworkQualityRequest;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionRealtimeStateServiceTest {
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 29, 22, 0);

	private RoomParticipantRepository participantRepository;
	private ApplicationEventPublisher eventPublisher;
	private RoomParticipant participant;
	private SessionRealtimeStateService service;

	@BeforeEach
	void setUp() {
		participantRepository = mock(RoomParticipantRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		participant = mock(RoomParticipant.class);
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(participant));
		when(participant.isSessionInProgress()).thenReturn(true);
		service = new SessionRealtimeStateService(
				participantRepository,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-29T13:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void changedMediaStateIsSavedAndPublished() {
		when(participant.updateMediaState(
				"PA_101",
				"client-a",
				true,
				false,
				NOW
		)).thenReturn(true);

		service.updateMediaState(
				101L,
				15L,
				new SessionMediaStateRequest(
						"client-a",
						"PA_101",
						true,
						false
				)
		);

		verify(participant).updateMediaState(
				"PA_101",
				"client-a",
				true,
				false,
				NOW
		);
		verify(eventPublisher).publishEvent(any(Object.class));
	}

	@Test
	void duplicateNetworkQualityDoesNotPublishEvent() {
		when(participant.updateNetworkQuality(
				"PA_101",
				"client-a",
				SessionNetworkQuality.GOOD,
				NOW
		)).thenReturn(false);

		service.updateNetworkQuality(
				101L,
				15L,
				new SessionNetworkQualityRequest(
						"client-a",
						"PA_101",
						SessionNetworkQuality.GOOD
				)
		);

		verify(eventPublisher, never()).publishEvent(any(Object.class));
	}

	@Test
	void realtimeStateCannotBeChangedBeforeSessionStarts() {
		when(participant.isSessionInProgress()).thenReturn(false);

		assertThatThrownBy(() -> service.updateMediaState(
				101L,
				15L,
				new SessionMediaStateRequest(
						"client-a",
						"PA_101",
						true,
						true
				)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_NOT_IN_PROGRESS
				)
		);
	}

	@Test
	void staleClientMediaRequestReturnsConnectionConflict() {
		when(participant.updateMediaState(
				"PA_old",
				"client-old",
				true,
				true,
				NOW
		)).thenThrow(new IllegalStateException("stale"));

		assertThatThrownBy(() -> service.updateMediaState(
				101L,
				15L,
				new SessionMediaStateRequest(
						"client-old",
						"PA_old",
						true,
						true
				)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_CONNECTION_CONFLICT
				)
		);
	}
}
