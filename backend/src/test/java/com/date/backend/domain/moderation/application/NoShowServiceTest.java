package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.config.NoShowPolicyProperties;
import com.date.backend.domain.moderation.domain.AttendancePenalty;
import com.date.backend.domain.moderation.domain.UserSanction;
import com.date.backend.domain.moderation.repository.AttendancePenaltyRepository;
import com.date.backend.domain.moderation.repository.UserSanctionRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NoShowServiceTest {
	private static final LocalDateTime SCHEDULED = LocalDateTime.of(2026, 8, 3, 19, 0);
	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private AttendancePenaltyRepository penaltyRepository;
	private UserSanctionRepository sanctionRepository;
	private WaitingRoom session;
	private RoomParticipant reporter;
	private RoomParticipant absent;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		penaltyRepository = mock(AttendancePenaltyRepository.class);
		sanctionRepository = mock(UserSanctionRepository.class);
		session = mock(WaitingRoom.class); reporter = mock(RoomParticipant.class); absent = mock(RoomParticipant.class);
		when(session.getScheduledStartAt()).thenReturn(SCHEDULED);
		when(sessionRepository.findWithMatchPairByIdForUpdate(1L)).thenReturn(Optional.of(session));
		when(reporter.getUserId()).thenReturn(10L); when(reporter.isJoined()).thenReturn(true);
		when(absent.getUserId()).thenReturn(20L); when(absent.isJoined()).thenReturn(false);
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(1L)).thenReturn(List.of(reporter, absent));
		when(penaltyRepository.findBySessionIdAndUserIdAndPenaltyType(1L, 20L, "NO_SHOW")).thenReturn(Optional.empty());
		when(penaltyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
		when(penaltyRepository.countByUserIdAndPenaltyType(20L, "NO_SHOW")).thenReturn(1L);
		when(sanctionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
	}

	@Test
	void recordsAbsentParticipantAndAppliesFirstRestriction() {
		NoShowService service = serviceAt(SCHEDULED.plusMinutes(5));
		var result = service.record(10L, 1L);
		assertThat(result.noShowUserId()).isEqualTo(20L);
		assertThat(result.accumulatedNoShowCount()).isEqualTo(1);
		assertThat(result.restrictionEndsAt()).isEqualTo(SCHEDULED.plusMinutes(5).plusDays(1));
		assertThat(result.alreadyRecorded()).isFalse();
		verify(penaltyRepository).save(any(AttendancePenalty.class));
		verify(sanctionRepository).save(any(UserSanction.class));
	}

	@Test
	void rejectsDecisionBeforeGraceDeadline() {
		assertThatThrownBy(() -> serviceAt(SCHEDULED.plusMinutes(4)).record(10L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ModerationErrorCode.NO_SHOW_GRACE_PERIOD_NOT_ELAPSED));
	}

	@Test
	void automaticallyRecordsParticipantWhoNeverJoined() {
		when(reporter.getJoinedAt()).thenReturn(SCHEDULED.minusMinutes(1));
		when(absent.getJoinedAt()).thenReturn(null);

		int recorded = serviceAt(SCHEDULED.plusMinutes(5)).recordAutomatically(1L);

		assertThat(recorded).isEqualTo(1);
		verify(penaltyRepository).save(any(AttendancePenalty.class));
		verify(sanctionRepository).save(any(UserSanction.class));
	}

	@Test
	void automaticDetectionDoesNotPenalizeWhenNobodyJoined() {
		when(reporter.getJoinedAt()).thenReturn(null);
		when(absent.getJoinedAt()).thenReturn(null);

		int recorded = serviceAt(SCHEDULED.plusMinutes(5)).recordAutomatically(1L);

		assertThat(recorded).isZero();
		verify(penaltyRepository, never()).save(any());
		verify(sanctionRepository, never()).save(any());
	}

	@Test
	void automaticDetectionIsIdempotentWhenPenaltyAlreadyExists() {
		when(reporter.getJoinedAt()).thenReturn(SCHEDULED.minusMinutes(1));
		when(absent.getJoinedAt()).thenReturn(null);
		when(penaltyRepository.findBySessionIdAndUserIdAndPenaltyType(1L, 20L, "NO_SHOW"))
				.thenReturn(Optional.of(mock(AttendancePenalty.class)));

		int recorded = serviceAt(SCHEDULED.plusMinutes(5)).recordAutomatically(1L);

		assertThat(recorded).isZero();
		verify(penaltyRepository, never()).save(any());
		verify(sanctionRepository, never()).save(any());
	}

	private NoShowService serviceAt(LocalDateTime now) {
		Clock clock = Clock.fixed(now.atZone(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));
		return new NoShowService(sessionRepository, participantRepository, penaltyRepository,
				sanctionRepository, new NoShowPolicyProperties(Duration.ofMinutes(5), Duration.ofDays(1),
				Duration.ofDays(3), Duration.ofDays(7)), clock);
	}
}
