package com.date.backend.domain.room.application;

import com.date.backend.domain.mission.application.SessionMissionProvisioningService;
import com.date.backend.domain.room.config.RoomEntryProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.response.SessionJoinResponse;
import com.date.backend.domain.room.dto.response.SessionParticipantStateResponse;
import com.date.backend.domain.room.dto.response.SessionStatusResponse;
import com.date.backend.domain.room.event.AiSessionStartedEvent;
import com.date.backend.domain.room.integration.LiveKitParticipantTokenIssuer;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class SessionLifecycleService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final RoomEntryProperties entryProperties;
	private final LiveKitParticipantTokenIssuer tokenIssuer;
	private final SessionMissionProvisioningService missionProvisioningService;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionLifecycleService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			RoomEntryProperties entryProperties,
			LiveKitParticipantTokenIssuer tokenIssuer,
			SessionMissionProvisioningService missionProvisioningService,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.entryProperties = entryProperties;
		this.tokenIssuer = tokenIssuer;
		this.missionProvisioningService = missionProvisioningService;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public SessionJoinResponse join(Long userId, Long sessionId) {
		WaitingRoom session = findSessionForUpdate(sessionId);
		RoomParticipant participant = findParticipantForUpdate(userId, sessionId);
		LocalDateTime now = LocalDateTime.now(clock);
		validateJoinable(session, participant, now);

		boolean joinedNow = participant.recordJoin(now);
		if (session.getStatus() == RoomSessionStatus.CREATED
				|| session.getStatus() == RoomSessionStatus.SCHEDULED) {
			session.markWaiting();
		}
		var issuedToken = tokenIssuer.issue(userId, session.getLivekitRoomName());
		return new SessionJoinResponse(
				sessionId,
				session.getStatus(),
				userId,
				participant.getJoinedAt(),
				!joinedNow,
				issuedToken.configured(),
				issuedToken.url(),
				issuedToken.accessToken()
		);
	}

	@Transactional
	public SessionStatusResponse start(Long userId, Long sessionId) {
		WaitingRoom session = findSessionForUpdate(sessionId);
		assertParticipant(userId, sessionId);
		if (session.isInProgress()) {
			return createStatus(session);
		}
		if (session.getStatus() != RoomSessionStatus.READY) {
			throw new BusinessException(SessionErrorCode.SESSION_STATE_CONFLICT);
		}
		LocalDateTime now = LocalDateTime.now(clock);
		if (now.isBefore(session.getScheduledStartAt())
				|| now.isAfter(session.getScheduledStartAt().plus(
						entryProperties.entryCloseAfter()
				))) {
			throw new BusinessException(
					SessionErrorCode.SESSION_JOIN_TIME_NOT_ALLOWED
			);
		}
		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		if (participants.size() != 2
				|| participants.stream().anyMatch(participant -> !participant.isJoined())) {
			throw new BusinessException(
					SessionErrorCode.SESSION_PARTICIPANTS_NOT_JOINED
			);
		}
		if (participants.stream().anyMatch(participant -> !participant.isReady())) {
			throw new BusinessException(
					SessionErrorCode.SESSION_PARTICIPANTS_NOT_READY
			);
		}
		if (participants.stream().anyMatch(
				participant -> participant.getConnectionStatus()
						!= SessionConnectionStatus.CONNECTED
		)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_PARTICIPANTS_NOT_CONNECTED
			);
		}
		session.start(now);
		missionProvisioningService.provision(session, participants, now);
		eventPublisher.publishEvent(AiSessionStartedEvent.of(
				session.getId(),
				now.atZone(clock.getZone()).toInstant(),
				participants
		));
		return createStatus(session, participants, now);
	}

	public SessionStatusResponse getStatus(Long userId, Long sessionId) {
		WaitingRoom session = sessionRepository.findWithMatchPairById(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		assertParticipant(userId, sessionId);
		return createStatus(session);
	}

	private WaitingRoom findSessionForUpdate(Long sessionId) {
		return sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
	}

	private RoomParticipant findParticipantForUpdate(Long userId, Long sessionId) {
		return participantRepository.findByRoomIdAndUserIdForUpdate(sessionId, userId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_PARTICIPANT
				));
	}

	private void assertParticipant(Long userId, Long sessionId) {
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_PARTICIPANT);
		}
	}

	private void validateJoinable(
			WaitingRoom session,
			RoomParticipant participant,
			LocalDateTime now
	) {
		if (session.getStatus() == RoomSessionStatus.COMPLETED
				|| session.getStatus() == RoomSessionStatus.CANCELLED) {
			throw new BusinessException(SessionErrorCode.SESSION_STATE_CONFLICT);
		}
		if (participant.isJoined() && session.isInProgress()) {
			return;
		}
		LocalDateTime openAt =
				session.getScheduledStartAt().minus(entryProperties.entryOpenBefore());
		LocalDateTime closeAt =
				session.getScheduledStartAt().plus(entryProperties.entryCloseAfter());
		if (now.isBefore(openAt) || now.isAfter(closeAt)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_JOIN_TIME_NOT_ALLOWED
			);
		}
	}

	private SessionStatusResponse createStatus(WaitingRoom session) {
		return createStatus(
				session,
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(session.getId()),
				LocalDateTime.now(clock)
		);
	}

	private SessionStatusResponse createStatus(
			WaitingRoom session,
			List<RoomParticipant> participants,
			LocalDateTime now
	) {
		boolean allJoined = participants.size() == 2
				&& participants.stream().allMatch(RoomParticipant::isJoined);
		boolean allReady = participants.size() == 2
				&& participants.stream().allMatch(RoomParticipant::isReady);
		boolean allConnected = participants.size() == 2
				&& participants.stream().allMatch(
						participant -> participant.getConnectionStatus()
								== SessionConnectionStatus.CONNECTED
				);
		return new SessionStatusResponse(
				session.getId(),
				session.getStatus(),
				session.getScheduledStartAt(),
				session.getActualStartAt(),
				remainingSeconds(session, now),
				allJoined,
				allReady,
				allConnected,
				participants.stream()
						.map(participant -> new SessionParticipantStateResponse(
								participant.getUserId(),
								participant.isJoined(),
								participant.isReady(),
								participant.getJoinedAt(),
								participant.getConnectionStatus(),
								participant.getConnectedAt(),
								participant.getDisconnectedAt(),
								participant.getLastHeartbeatAt(),
								participant.getReconnectingAt(),
								participant.getReconnectDeadlineAt(),
								participant.getReconnectedAt(),
								participant.getRecoveryFailedAt(),
								participant.getReconnectAttemptCount(),
								participant.isCameraEnabled(),
								participant.isMicrophoneEnabled(),
								participant.getNetworkQuality(),
								participant.getMediaStateUpdatedAt(),
								participant.getNetworkQualityUpdatedAt()
						))
						.toList()
		);
	}

	private long remainingSeconds(WaitingRoom session, LocalDateTime now) {
		if (session.getStatus() == RoomSessionStatus.COMPLETED
				|| session.getStatus() == RoomSessionStatus.CANCELLED) {
			return 0;
		}
		LocalDateTime deadline = session.getScheduledStartAt();
		if (session.isInProgress() && session.getActualStartAt() != null) {
			deadline = session.getActualStartAt().plusSeconds(
					(long) session.getPlannedDurationSec()
							+ session.getExtensionDurationSec()
			);
		}
		return Math.max(0, Duration.between(now, deadline).getSeconds());
	}
}
