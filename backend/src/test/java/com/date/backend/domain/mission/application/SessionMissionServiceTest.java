package com.date.backend.domain.mission.application;

import com.date.backend.domain.mission.domain.MissionCatalog;
import com.date.backend.domain.mission.domain.SessionMission;
import com.date.backend.domain.mission.repository.SessionMissionRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MissionErrorCode;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionMissionServiceTest {
	private SessionMissionRepository sessionMissionRepository;
	private RoomParticipantRepository participantRepository;
	private SessionMissionService service;

	@BeforeEach
	void setUp() {
		sessionMissionRepository = mock(SessionMissionRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		service = new SessionMissionService(
				sessionMissionRepository,
				participantRepository
		);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
	}

	@Test
	void participantReadsOnlyOwnMissions() {
		SessionMission sessionMission = sessionMission();
		when(sessionMissionRepository
				.findAllBySession_IdAndUserIdOrderByMission_DisplayOrderAsc(
						15L,
						101L
				)).thenReturn(List.of(sessionMission));

		var response = service.getMyMissions(101L, 15L);

		assertThat(response.sessionId()).isEqualTo(15L);
		assertThat(response.userId()).isEqualTo(101L);
		assertThat(response.missions()).hasSize(1);
		verify(sessionMissionRepository)
				.findAllBySession_IdAndUserIdOrderByMission_DisplayOrderAsc(
						15L,
						101L
				);
	}

	@Test
	void nonParticipantCannotReadMissions() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 999L))
				.thenReturn(false);

		assertThatThrownBy(() -> service.getMyMissions(999L, 15L))
				.isInstanceOfSatisfying(
						BusinessException.class,
						exception -> assertThat(exception.getErrorCode())
								.isEqualTo(
										SessionErrorCode
												.SESSION_NOT_PARTICIPANT
								)
				);
	}

	@Test
	void aiProgressUpdatesAssignedMission() {
		SessionMission sessionMission = sessionMission();
		LocalDateTime occurredAt =
				LocalDateTime.of(2026, 7, 30, 19, 1);
		when(sessionMissionRepository.findForUpdate(
				15L,
				101L,
				"ASK_FOLLOW_UP_QUESTION"
		)).thenReturn(Optional.of(sessionMission));

		service.addProgress(
				15L,
				101L,
				"ASK_FOLLOW_UP_QUESTION",
				1,
				occurredAt
		);

		verify(sessionMission).addProgress(1, occurredAt);
	}

	@Test
	void unknownMissionProgressIsRejected() {
		when(sessionMissionRepository.findForUpdate(
				15L,
				101L,
				"UNKNOWN"
		)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.addProgress(
				15L,
				101L,
				"UNKNOWN",
				1,
				LocalDateTime.now()
		)).isInstanceOfSatisfying(
				BusinessException.class,
				exception -> assertThat(exception.getErrorCode())
						.isEqualTo(
								MissionErrorCode.SESSION_MISSION_NOT_FOUND
						)
		);
	}

	private SessionMission sessionMission() {
		MissionCatalog catalog = mock(MissionCatalog.class);
		when(catalog.getCode()).thenReturn("ASK_FOLLOW_UP_QUESTION");
		when(catalog.getTitle()).thenReturn("확장 질문 1회 하기");
		when(catalog.getDescription()).thenReturn("설명");
		SessionMission sessionMission = mock(SessionMission.class);
		when(sessionMission.getMission()).thenReturn(catalog);
		return sessionMission;
	}
}
