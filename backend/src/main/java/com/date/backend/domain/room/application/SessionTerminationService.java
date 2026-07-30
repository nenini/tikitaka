package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.response.SessionEndedResponse;
import com.date.backend.domain.room.event.SessionEndedEvent;
import com.date.backend.domain.room.event.LiveKitRoomDeletionRequestedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class SessionTerminationService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionTerminationService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public SessionEndedResponse complete(Long userId, Long sessionId) {
		assertParticipant(userId, sessionId);
		return end(
				sessionId,
				SessionTerminationReason.NORMAL_COMPLETION,
				userId,
				LocalDateTime.now(clock)
		).response();
	}

	@Transactional
	public SessionEndedResponse terminate(
			Long userId,
			Long sessionId,
			SessionTerminationReason reason
	) {
		assertParticipant(userId, sessionId);
		if (reason != SessionTerminationReason.USER_REQUEST
				&& reason != SessionTerminationReason.SAFETY_CONCERN
				&& reason != SessionTerminationReason.TECHNICAL_ISSUE
				&& reason != SessionTerminationReason.OTHER) {
			throw new IllegalArgumentException(
					"사용자가 선택할 수 없는 조기 종료 사유입니다."
			);
		}
		return end(
				sessionId,
				reason,
				userId,
				LocalDateTime.now(clock)
		).response();
	}

	@Transactional
	public boolean completeByTimer(
			Long sessionId,
			LocalDateTime endedAt
	) {
		return end(
				sessionId,
				SessionTerminationReason.TIME_EXPIRED,
				null,
				endedAt
		).changed();
	}

	@Transactional
	public boolean terminateForConnectionFailure(
			Long sessionId,
			SessionTerminationReason reason,
			LocalDateTime endedAt
	) {
		if (reason != SessionTerminationReason.RECONNECT_TIMEOUT) {
			throw new IllegalArgumentException(
					"지원하지 않는 비정상 세션 종료 사유입니다."
			);
		}
		return end(sessionId, reason, null, endedAt).changed();
	}

	private EndResult end(
			Long sessionId,
			SessionTerminationReason reason,
			Long endedByUserId,
			LocalDateTime endedAt
	) {
		LocalDateTime persistedEndedAt = endedAt.withNano(0);
		WaitingRoom session = sessionRepository
				.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (session.isEnded()) {
			return new EndResult(false, responseOf(session));
		}
		if (!session.isInProgress()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_STATE_CONFLICT
			);
		}

		if (reason == SessionTerminationReason.TIME_EXPIRED) {
			session.complete(persistedEndedAt, reason, endedByUserId);
		} else if (reason == SessionTerminationReason.NORMAL_COMPLETION) {
			session.complete(persistedEndedAt, reason, endedByUserId);
		} else {
			session.terminate(persistedEndedAt, reason, endedByUserId);
		}
		SessionEndedResponse response = new SessionEndedResponse(
				SessionEndedResponse.SESSION_ENDED,
				session.getId(),
				session.getStatus(),
				reason,
				endedByUserId,
				persistedEndedAt
		);
		eventPublisher.publishEvent(new SessionEndedEvent(response));
		eventPublisher.publishEvent(
				new LiveKitRoomDeletionRequestedEvent(
						session.getId(),
						session.getLivekitRoomName()
				)
		);
		return new EndResult(true, response);
	}

	private void assertParticipant(Long userId, Long sessionId) {
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_PARTICIPANT);
		}
	}

	private SessionEndedResponse responseOf(WaitingRoom session) {
		return new SessionEndedResponse(
				SessionEndedResponse.SESSION_ENDED,
				session.getId(),
				session.getStatus(),
				SessionTerminationReason.valueOf(session.getTerminationReason()),
				session.getEndedByUserId(),
				session.getActualEndAt()
		);
	}

	private record EndResult(
			boolean changed,
			SessionEndedResponse response
	) {
	}
}
