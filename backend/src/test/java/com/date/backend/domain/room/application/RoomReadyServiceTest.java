package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.domain.RoomDeviceCheck;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.RoomParticipantStatusChangedEvent;
import com.date.backend.domain.room.repository.RoomDeviceCheckRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomReadyServiceTest {
	private WaitingRoomRepository roomRepository;
	private RoomParticipantRepository participantRepository;
	private RoomDeviceCheckRepository deviceCheckRepository;
	private ProfileRepository profileRepository;
	private ApplicationEventPublisher eventPublisher;
	private RoomReadyService service;
	private WaitingRoom room;
	private RoomParticipant participant;

	@BeforeEach
	void setUp() {
		roomRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		deviceCheckRepository = mock(RoomDeviceCheckRepository.class);
		profileRepository = mock(ProfileRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		service = new RoomReadyService(
				roomRepository,
				participantRepository,
				deviceCheckRepository,
				profileRepository,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-29T02:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
		room = mock(WaitingRoom.class);
		MatchPair matchPair = mock(MatchPair.class);
		when(room.getMatchPair()).thenReturn(matchPair);
		when(matchPair.getStatus()).thenReturn(MatchStatus.CONFIRMED);
		when(room.getStatus()).thenReturn(RoomSessionStatus.SCHEDULED);
		participant = new RoomParticipant(room, 101L, "USER_A");
		when(roomRepository.findWithMatchPairById(1L)).thenReturn(Optional.of(room));
		when(roomRepository.findWithMatchPairByIdForUpdate(1L))
				.thenReturn(Optional.of(room));
		when(participantRepository.findByRoomIdAndUserIdForUpdate(1L, 101L))
				.thenReturn(Optional.of(participant));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(1L))
				.thenReturn(List.of(participant));
		when(profileRepository.findAllById(List.of(101L))).thenReturn(List.of());
	}

	@Test
	void marksReadyOnlyAfterLatestDeviceCheckPassesAndIsIdempotent() {
		RoomDeviceCheck check = mock(RoomDeviceCheck.class);
		when(check.isReadyAvailable()).thenReturn(true);
		when(deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(1L, 101L))
				.thenReturn(Optional.of(check));

		var first = service.markReady(101L, 1L);
		var second = service.markReady(101L, 1L);

		assertThat(first.participants().getFirst().ready()).isTrue();
		assertThat(second.participants().getFirst().ready()).isTrue();
		verify(eventPublisher, times(1))
				.publishEvent(any(RoomParticipantStatusChangedEvent.class));
	}

	@Test
	void rejectsReadyWhenDeviceCheckIsMissingOrFailed() {
		when(deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(1L, 101L))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.markReady(101L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.DEVICE_CHECK_REQUIRED)
				);

		RoomDeviceCheck failedCheck = mock(RoomDeviceCheck.class);
		when(failedCheck.isReadyAvailable()).thenReturn(false);
		when(deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(1L, 101L))
				.thenReturn(Optional.of(failedCheck));
		assertThatThrownBy(() -> service.markReady(101L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.DEVICE_CHECK_FAILED)
				);
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void cancelsReadyIdempotently() {
		participant.markReady();

		assertThat(service.cancelReady(101L, 1L).participants().getFirst().ready())
				.isFalse();
		assertThat(service.cancelReady(101L, 1L).participants().getFirst().ready())
				.isFalse();
		verify(eventPublisher, times(1))
				.publishEvent(any(RoomParticipantStatusChangedEvent.class));
	}
}
