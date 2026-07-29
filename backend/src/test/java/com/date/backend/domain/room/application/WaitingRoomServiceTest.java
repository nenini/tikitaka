package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.config.RoomEntryProperties;
import com.date.backend.domain.room.domain.RoomEntryStatus;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WaitingRoomServiceTest {
	private static final Long ROOM_ID = 10L;
	private static final Long MATCH_PAIR_ID = 20L;
	private static final Long USER_A_ID = 101L;
	private static final Long USER_B_ID = 102L;
	private static final LocalDateTime SCHEDULED_AT =
			LocalDateTime.of(2026, 7, 28, 19, 0);

	private final WaitingRoomRepository roomRepository = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participantRepository =
			mock(RoomParticipantRepository.class);
	private final ProfileRepository profileRepository = mock(ProfileRepository.class);
	private final Clock clock = Clock.fixed(
			Instant.parse("2026-07-28T09:55:00Z"),
			ZoneId.of("Asia/Seoul")
	);
	private final WaitingRoomService service = new WaitingRoomService(
			roomRepository,
			participantRepository,
			profileRepository,
			new RoomEntryProperties(Duration.ofMinutes(10), Duration.ofMinutes(10)),
			clock
	);

	private WaitingRoom room;
	private RoomParticipant participantA;
	private RoomParticipant participantB;

	@BeforeEach
	void setUp() {
		room = mock(WaitingRoom.class);
		MatchPair matchPair = mock(MatchPair.class);
		participantA = mock(RoomParticipant.class);
		participantB = mock(RoomParticipant.class);
		Profile profileA = mock(Profile.class);
		Profile profileB = mock(Profile.class);

		when(room.getId()).thenReturn(ROOM_ID);
		when(room.getMatchPair()).thenReturn(matchPair);
		when(room.getStatus()).thenReturn(RoomSessionStatus.SCHEDULED);
		when(room.getScheduledStartAt()).thenReturn(SCHEDULED_AT);
		when(matchPair.getId()).thenReturn(MATCH_PAIR_ID);
		when(matchPair.getStatus()).thenReturn(MatchStatus.CONFIRMED);
		when(participantA.getUserId()).thenReturn(USER_A_ID);
		when(participantA.getParticipationStatus()).thenReturn("WAITING");
		when(participantB.getUserId()).thenReturn(USER_B_ID);
		when(participantB.getParticipationStatus()).thenReturn("WAITING");
		when(profileA.getUserId()).thenReturn(USER_A_ID);
		when(profileA.getNickname()).thenReturn("사용자A");
		when(profileB.getUserId()).thenReturn(USER_B_ID);
		when(profileB.getNickname()).thenReturn("사용자B");

		when(roomRepository.findWithMatchPairById(ROOM_ID)).thenReturn(Optional.of(room));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(ROOM_ID))
				.thenReturn(List.of(participantA, participantB));
		when(profileRepository.findAllById(List.of(USER_A_ID, USER_B_ID)))
				.thenReturn(List.of(profileA, profileB));
	}

	@Test
	void participantCanReadWaitingRoomDetailDuringEntryWindow() {
		var response = service.getDetail(USER_A_ID, ROOM_ID);

		assertThat(response.roomId()).isEqualTo(ROOM_ID);
		assertThat(response.matchPairId()).isEqualTo(MATCH_PAIR_ID);
		assertThat(response.canEnter()).isTrue();
		assertThat(response.entryStatus()).isEqualTo(RoomEntryStatus.AVAILABLE);
		assertThat(response.participants()).hasSize(2);
		assertThat(response.participants().getFirst().nickname()).isEqualTo("사용자A");
	}

	@Test
	void nonParticipantIsRejected() {
		assertThatThrownBy(() -> service.getDetail(999L, ROOM_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.ROOM_NOT_PARTICIPANT)
				);
	}

	@Test
	void missingRoomIsRejected() {
		when(roomRepository.findWithMatchPairById(999L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getDetail(USER_A_ID, 999L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(RoomErrorCode.ROOM_NOT_FOUND)
				);
	}

	@Test
	void beforeEntryWindowReturnsReasonWithoutExposingLiveKitCredentials() {
		Clock earlyClock = Clock.fixed(
				Instant.parse("2026-07-28T09:00:00Z"),
				ZoneId.of("Asia/Seoul")
		);
		WaitingRoomService earlyService = new WaitingRoomService(
				roomRepository,
				participantRepository,
				profileRepository,
				new RoomEntryProperties(Duration.ofMinutes(10), Duration.ofMinutes(10)),
				earlyClock
		);

		var response = earlyService.getDetail(USER_A_ID, ROOM_ID);

		assertThat(response.canEnter()).isFalse();
		assertThat(response.entryStatus()).isEqualTo(RoomEntryStatus.TOO_EARLY);
		assertThat(response.enterableFrom()).isEqualTo(SCHEDULED_AT.minusMinutes(10));
	}
}
