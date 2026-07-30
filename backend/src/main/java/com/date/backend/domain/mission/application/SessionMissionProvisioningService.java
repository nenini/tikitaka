package com.date.backend.domain.mission.application;

import com.date.backend.domain.mission.domain.MissionCatalog;
import com.date.backend.domain.mission.domain.SessionMission;
import com.date.backend.domain.mission.repository.MissionCatalogRepository;
import com.date.backend.domain.mission.repository.SessionMissionRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.survey.domain.UserPracticeGoal;
import com.date.backend.domain.survey.repository.UserPracticeGoalRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SessionMissionProvisioningService {
	private final UserPracticeGoalRepository userPracticeGoalRepository;
	private final MissionCatalogRepository missionCatalogRepository;
	private final SessionMissionRepository sessionMissionRepository;

	public SessionMissionProvisioningService(
			UserPracticeGoalRepository userPracticeGoalRepository,
			MissionCatalogRepository missionCatalogRepository,
			SessionMissionRepository sessionMissionRepository
	) {
		this.userPracticeGoalRepository = userPracticeGoalRepository;
		this.missionCatalogRepository = missionCatalogRepository;
		this.sessionMissionRepository = sessionMissionRepository;
	}

	public void provision(
			WaitingRoom session,
			List<RoomParticipant> participants,
			LocalDateTime assignedAt
	) {
		if (sessionMissionRepository.existsBySession_Id(session.getId())) {
			return;
		}

		Map<Long, List<UserPracticeGoal>> goalsByUser = participants.stream()
				.collect(Collectors.toMap(
						RoomParticipant::getUserId,
						participant -> userPracticeGoalRepository
								.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(
										participant.getUserId()
								)
				));
		List<String> goalCodes = goalsByUser.values().stream()
				.flatMap(List::stream)
				.map(UserPracticeGoal::getPracticeGoal)
				.map(goal -> goal.getCode())
				.distinct()
				.toList();
		if (goalCodes.isEmpty()) {
			return;
		}

		Map<String, List<MissionCatalog>> missionsByGoalCode =
				missionCatalogRepository
						.findAllByPracticeGoalCodeInAndActiveTrueOrderByDisplayOrderAsc(
								goalCodes
						).stream()
						.collect(Collectors.groupingBy(
								MissionCatalog::getPracticeGoalCode
						));
		List<SessionMission> sessionMissions = goalsByUser.entrySet().stream()
				.flatMap(entry -> entry.getValue().stream()
						.map(UserPracticeGoal::getPracticeGoal)
						.flatMap(goal -> missionsByGoalCode
								.getOrDefault(goal.getCode(), List.of())
								.stream())
						.map(mission -> new SessionMission(
								session,
								entry.getKey(),
								mission,
								assignedAt
						)))
				.toList();
		sessionMissionRepository.saveAll(sessionMissions);
	}
}
