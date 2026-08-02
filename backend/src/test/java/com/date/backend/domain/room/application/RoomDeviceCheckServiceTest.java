package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.room.domain.RoomDeviceCheck;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.request.RoomDeviceCheckRequest;
import com.date.backend.domain.room.repository.RoomDeviceCheckRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RoomDeviceCheckServiceTest {
	private static final Long ROOM_ID = 15L;
	private static final Long USER_ID = 101L;
	private static final LocalDateTime CHECKED_AT =
			LocalDateTime.of(2026, 7, 29, 10, 0);

	private final WaitingRoomRepository roomRepository = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participantRepository =
			mock(RoomParticipantRepository.class);
	private final RoomDeviceCheckRepository deviceCheckRepository =
			mock(RoomDeviceCheckRepository.class);
	private final Clock clock = Clock.fixed(
			Instant.parse("2026-07-29T01:00:00Z"),
			ZoneId.of("Asia/Seoul")
	);
	private final RoomDeviceCheckService service = new RoomDeviceCheckService(
			roomRepository,
			participantRepository,
			deviceCheckRepository,
			clock
	);

	private WaitingRoom room;

	@BeforeEach
	void setUp() {
		room = mock(WaitingRoom.class);
		MatchPair pair = mock(MatchPair.class);
		when(room.getMatchPair()).thenReturn(pair);
		when(room.getStatus()).thenReturn(RoomSessionStatus.SCHEDULED);
		when(pair.getStatus()).thenReturn(MatchStatus.CONFIRMED);
		when(roomRepository.findWithMatchPairById(ROOM_ID)).thenReturn(Optional.of(room));
		when(participantRepository.existsByRoom_IdAndUserId(ROOM_ID, USER_ID))
				.thenReturn(true);
		when(deviceCheckRepository.saveAndFlush(any(RoomDeviceCheck.class)))
				.thenAnswer(invocation -> {
					RoomDeviceCheck check = invocation.getArgument(0);
					ReflectionTestUtils.setField(check, "id", 31L);
					return check;
				});
	}

	@Test
	void allRequiredChecksPassingAllowsReady() {
		var response = service.save(
				USER_ID,
				ROOM_ID,
				new RoomDeviceCheckRequest(true, true, true, true)
		);

		assertThat(response.deviceCheckId()).isEqualTo(31L);
		assertThat(response.readyAvailable()).isTrue();
		assertThat(response.checkedAt()).isEqualTo(CHECKED_AT);
	}

	@Test
	void anyFailedCheckPreventsReady() {
		var response = service.save(
				USER_ID,
				ROOM_ID,
				new RoomDeviceCheckRequest(true, true, false, true)
		);

		assertThat(response.readyAvailable()).isFalse();
		assertThat(response.speakerPassed()).isFalse();
	}

	@Test
	void returnsLatestCheckForCurrentParticipant() {
		RoomDeviceCheck latest = new RoomDeviceCheck(
				room,
				USER_ID,
				true,
				true,
				true,
				true,
				CHECKED_AT
		);
		ReflectionTestUtils.setField(latest, "id", 42L);
		when(deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(ROOM_ID, USER_ID))
				.thenReturn(Optional.of(latest));

		var response = service.getLatest(USER_ID, ROOM_ID);

		assertThat(response.deviceCheckId()).isEqualTo(42L);
		assertThat(response.readyAvailable()).isTrue();
	}

	@Test
	void nonParticipantCannotSaveOrReadDeviceCheck() {
		when(participantRepository.existsByRoom_IdAndUserId(ROOM_ID, 999L))
				.thenReturn(false);

		assertThatThrownBy(() -> service.save(
				999L,
				ROOM_ID,
				new RoomDeviceCheckRequest(true, true, true, true)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode())
						.isEqualTo(RoomErrorCode.ROOM_NOT_PARTICIPANT)
		);
		assertThatThrownBy(() -> service.getLatest(999L, ROOM_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.ROOM_NOT_PARTICIPANT)
				);
	}

	@Test
	void missingLatestCheckReturnsNotFound() {
		when(deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(ROOM_ID, USER_ID))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getLatest(USER_ID, ROOM_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.DEVICE_CHECK_NOT_FOUND)
				);
	}

	@Test
	void cancelledRoomRejectsNewDeviceCheck() {
		when(room.getStatus()).thenReturn(RoomSessionStatus.CANCELLED);

		assertThatThrownBy(() -> service.save(
				USER_ID,
				ROOM_ID,
				new RoomDeviceCheckRequest(true, true, true, true)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode())
						.isEqualTo(RoomErrorCode.DEVICE_CHECK_NOT_ALLOWED)
		);
	}
}
