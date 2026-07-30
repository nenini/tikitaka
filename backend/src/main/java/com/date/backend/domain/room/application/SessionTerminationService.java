package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.SessionEndedEvent;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class SessionTerminationService {
	private final WaitingRoomRepository sessionRepository;
	private final LiveKitRoomManager liveKitRoomManager;
	private final ApplicationEventPublisher eventPublisher;

	public SessionTerminationService(
			WaitingRoomRepository sessionRepository,
			LiveKitRoomManager liveKitRoomManager,
			ApplicationEventPublisher eventPublisher
	) {
		this.sessionRepository = sessionRepository;
		this.liveKitRoomManager = liveKitRoomManager;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public boolean completeByTimer(
			Long sessionId,
			LocalDateTime endedAt
	) {
		return end(
				sessionId,
				SessionTerminationReason.TIME_EXPIRED,
				endedAt
		);
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
		return end(sessionId, reason, endedAt);
	}

	private boolean end(
			Long sessionId,
			SessionTerminationReason reason,
			LocalDateTime endedAt
	) {
		WaitingRoom session = sessionRepository
				.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (session.isEnded()) {
			return false;
		}
		if (!session.isInProgress()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_STATE_CONFLICT
			);
		}

		if (reason == SessionTerminationReason.TIME_EXPIRED) {
			session.complete(endedAt, reason);
		} else {
			session.terminate(endedAt, reason);
		}
		liveKitRoomManager.deleteRoom(session.getLivekitRoomName());
		eventPublisher.publishEvent(
				SessionEndedEvent.of(
						session.getId(),
						session.getStatus(),
						reason,
						endedAt
				)
		);
		return true;
	}
}
