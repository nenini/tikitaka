package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionQueryServiceTest {
	private static final Long SESSION_ID = 15L;
	private static final Long USER_A_ID = 101L;
	private static final Long USER_B_ID = 102L;
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 30, 18, 50);

	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private ProfileRepository profileRepository;
	private SessionQueryService service;
	private WaitingRoom session;
	private RoomParticipant participantA;
	private RoomParticipant participantB;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		profileRepository = mock(ProfileRepository.class);
		service = new SessionQueryService(
				sessionRepository,
				participantRepository,
				profileRepository,
				Clock.fixed(
						Instant.parse("2026-07-30T09:50:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
		session = mock(WaitingRoom.class);
		MatchPair matchPair = mock(MatchPair.class);
		participantA = participant(USER_A_ID, "A");
		participantB = participant(USER_B_ID, "B");
		when(session.getId()).thenReturn(SESSION_ID);
		when(session.getMatchPair()).thenReturn(matchPair);
		when(matchPair.getId()).thenReturn(30L);
		when(session.getStatus()).thenReturn(RoomSessionStatus.SCHEDULED);
		when(session.getScheduledStartAt()).thenReturn(NOW.plusMinutes(10));
		when(session.getPlannedDurationSec()).thenReturn(1800);
		when(sessionRepository.findWithMatchPairById(SESSION_ID))
				.thenReturn(Optional.of(session));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(SESSION_ID))
				.thenReturn(List.of(participantA, participantB));
	}

	@Test
	void participantCanReadDetailWithRemainingSeconds() {
		Profile profileA = mock(Profile.class);
		when(profileA.getUserId()).thenReturn(USER_A_ID);
		when(profileA.getNickname()).thenReturn("사용자A");
		when(profileRepository.findAllById(List.of(USER_A_ID, USER_B_ID)))
				.thenReturn(List.of(profileA));

		var response = service.getDetail(USER_A_ID, SESSION_ID);

		assertThat(response.sessionId()).isEqualTo(SESSION_ID);
		assertThat(response.matchPairId()).isEqualTo(30L);
		assertThat(response.status()).isEqualTo(RoomSessionStatus.SCHEDULED);
		assertThat(response.remainingSeconds()).isEqualTo(600);
		assertThat(response.participants()).hasSize(2);
		assertThat(response.participants().getFirst().nickname())
				.isEqualTo("사용자A");
	}

	@Test
	void nonParticipantIsForbidden() {
		assertThatThrownBy(() -> service.getDetail(999L, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(SessionErrorCode.SESSION_NOT_PARTICIPANT)
				);
	}

	@Test
	void missingSessionReturnsNotFound() {
		when(sessionRepository.findWithMatchPairById(999L))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.getDetail(USER_A_ID, 999L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(SessionErrorCode.SESSION_NOT_FOUND)
				);
	}

	private RoomParticipant participant(Long userId, String role) {
		RoomParticipant participant = mock(RoomParticipant.class);
		when(participant.getUserId()).thenReturn(userId);
		when(participant.getParticipantRole()).thenReturn(role);
		when(participant.getParticipationStatus()).thenReturn("WAITING");
		return participant;
	}
}
