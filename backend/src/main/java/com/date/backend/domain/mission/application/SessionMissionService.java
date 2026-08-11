package com.date.backend.domain.mission.application;

import com.date.backend.domain.mission.domain.SessionMission;
import com.date.backend.domain.mission.dto.response.SessionMissionResponse;
import com.date.backend.domain.mission.dto.response.SessionMissionsResponse;
import com.date.backend.domain.mission.repository.SessionMissionRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MissionErrorCode;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@Transactional(readOnly = true)
public class SessionMissionService {
	private final SessionMissionRepository sessionMissionRepository;
	private final RoomParticipantRepository participantRepository;

	public SessionMissionService(
			SessionMissionRepository sessionMissionRepository,
			RoomParticipantRepository participantRepository
	) {
		this.sessionMissionRepository = sessionMissionRepository;
		this.participantRepository = participantRepository;
	}

	public SessionMissionsResponse getMyMissions(
			Long userId,
			Long sessionId
	) {
		assertParticipant(userId, sessionId);
		return new SessionMissionsResponse(
				sessionId,
				userId,
				sessionMissionRepository
						.findAllBySession_IdAndUserIdOrderByMission_DisplayOrderAsc(
								sessionId,
								userId
						).stream()
						.map(SessionMissionResponse::from)
						.toList()
		);
	}

	@Transactional
	public SessionMissionResponse addProgress(
			Long sessionId,
			Long userId,
			String missionCode,
			int increment,
			LocalDateTime occurredAt
	) {
		assertParticipant(userId, sessionId);
		SessionMission sessionMission = sessionMissionRepository.findForUpdate(
				sessionId,
				userId,
				missionCode
		).orElseThrow(() -> new BusinessException(
				MissionErrorCode.SESSION_MISSION_NOT_FOUND
		));
		sessionMission.addProgress(increment, occurredAt);
		return SessionMissionResponse.from(sessionMission);
	}

	private void assertParticipant(Long userId, Long sessionId) {
		if (!participantRepository.existsByRoom_IdAndUserId(
				sessionId,
				userId
		)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_NOT_PARTICIPANT
			);
		}
	}
}
