package com.date.backend.domain.mission.application;

import com.date.backend.domain.mission.domain.MissionCatalog;
import com.date.backend.domain.mission.domain.SessionMission;
import com.date.backend.domain.mission.repository.MissionCatalogRepository;
import com.date.backend.domain.mission.repository.SessionMissionRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.UserPracticeGoal;
import com.date.backend.domain.survey.repository.UserPracticeGoalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionMissionProvisioningServiceTest {
	private UserPracticeGoalRepository userPracticeGoalRepository;
	private MissionCatalogRepository missionCatalogRepository;
	private SessionMissionRepository sessionMissionRepository;
	private SessionMissionProvisioningService service;
	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		userPracticeGoalRepository =
				mock(UserPracticeGoalRepository.class);
		missionCatalogRepository = mock(MissionCatalogRepository.class);
		sessionMissionRepository = mock(SessionMissionRepository.class);
		service = new SessionMissionProvisioningService(
				userPracticeGoalRepository,
				missionCatalogRepository,
				sessionMissionRepository
		);
		session = mock(WaitingRoom.class);
		when(session.getId()).thenReturn(15L);
	}

	@Test
	void provisionsMissionsFromEachParticipantsPracticeGoals() {
		RoomParticipant participantA = participant(101L);
		RoomParticipant participantB = participant(202L);
		UserPracticeGoal goalA = goal("TALK_TOO_LITTLE");
		UserPracticeGoal goalB = goal("VOICE_TOO_QUIET");
		MissionCatalog missionA = mission(
				"TALK_TOO_LITTLE",
				"ASK_FOLLOW_UP_QUESTION"
		);
		MissionCatalog missionB = mission(
				"VOICE_TOO_QUIET",
				"KEEP_COMFORTABLE_VOLUME_HIGHER"
		);
		when(userPracticeGoalRepository
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(
						101L
				)).thenReturn(List.of(goalA));
		when(userPracticeGoalRepository
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(
						202L
				)).thenReturn(List.of(goalB));
		when(missionCatalogRepository
				.findAllByPracticeGoalCodeInAndActiveTrueOrderByDisplayOrderAsc(
						anyList()
				)).thenReturn(List.of(missionA, missionB));

		service.provision(
				session,
				List.of(participantA, participantB),
				LocalDateTime.of(2026, 7, 30, 19, 0)
		);

		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<SessionMission>> captor =
				ArgumentCaptor.forClass(List.class);
		verify(sessionMissionRepository).saveAll(captor.capture());
		assertThat(captor.getValue()).hasSize(2);
		assertThat(captor.getValue())
				.extracting(SessionMission::getUserId)
				.containsExactlyInAnyOrder(101L, 202L);
	}

	@Test
	void provisioningIsIdempotentForExistingSessionMissions() {
		when(sessionMissionRepository.existsBySession_Id(15L))
				.thenReturn(true);

		service.provision(
				session,
				List.of(participant(101L)),
				LocalDateTime.now()
		);

		verify(userPracticeGoalRepository, never())
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(
						101L
				);
		verify(sessionMissionRepository, never()).saveAll(anyList());
	}

	private RoomParticipant participant(Long userId) {
		RoomParticipant participant = mock(RoomParticipant.class);
		when(participant.getUserId()).thenReturn(userId);
		return participant;
	}

	private UserPracticeGoal goal(String code) {
		PracticeGoalCatalog catalog = mock(PracticeGoalCatalog.class);
		when(catalog.getCode()).thenReturn(code);
		UserPracticeGoal goal = mock(UserPracticeGoal.class);
		when(goal.getPracticeGoal()).thenReturn(catalog);
		return goal;
	}

	private MissionCatalog mission(String goalCode, String missionCode) {
		MissionCatalog mission = mock(MissionCatalog.class);
		when(mission.getPracticeGoalCode()).thenReturn(goalCode);
		when(mission.getCode()).thenReturn(missionCode);
		when(mission.getTargetValue()).thenReturn(1);
		return mission;
	}
}
