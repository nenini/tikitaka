package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionRealtimeProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionClientConnectionState;
import com.date.backend.domain.room.dto.request.SessionConnectionStateRequest;
import com.date.backend.domain.room.dto.request.SessionHeartbeatRequest;
import com.date.backend.domain.room.event.SessionParticipantConnectionChangedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class SessionRealtimeConnectionService {
	private final RoomParticipantRepository participantRepository;
	private final SessionRealtimeProperties properties;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionRealtimeConnectionService(
			RoomParticipantRepository participantRepository,
			SessionRealtimeProperties properties,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.participantRepository = participantRepository;
		this.properties = properties;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public void heartbeat(
			Long userId,
			Long sessionId,
			SessionHeartbeatRequest request
	) {
		RoomParticipant participant = findParticipant(userId, sessionId);
		try {
			participant.recordHeartbeat(
					request.participantSid(),
					request.clientInstanceId(),
					LocalDateTime.now(clock)
			);
		} catch (IllegalArgumentException | IllegalStateException exception) {
			throw connectionConflict(exception);
		}
	}

	@Transactional
	public void updateConnectionState(
			Long userId,
			Long sessionId,
			SessionConnectionStateRequest request
	) {
		RoomParticipant participant = findParticipant(userId, sessionId);
		LocalDateTime now = LocalDateTime.now(clock);
		boolean changed;
		try {
			changed = switch (request.state()) {
				case RECONNECTING -> participant.startReconnecting(
						request.participantSid(),
						request.clientInstanceId(),
						now,
						now.plus(properties.reconnectGracePeriod())
				);
				case RECONNECTED -> participant.recordReconnected(
						request.participantSid(),
						request.clientInstanceId(),
						now
				);
			};
		} catch (IllegalArgumentException | IllegalStateException exception) {
			throw connectionConflict(exception);
		}

		if (changed) {
			eventPublisher.publishEvent(
					SessionParticipantConnectionChangedEvent.of(
							eventType(request.state()),
							participant,
							now
					)
			);
		}
	}

	private RoomParticipant findParticipant(Long userId, Long sessionId) {
		return participantRepository.findByRoomIdAndUserIdForUpdate(
						sessionId,
						userId
				)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_PARTICIPANT
				));
	}

	private BusinessException connectionConflict(RuntimeException exception) {
		return new BusinessException(
				SessionErrorCode.SESSION_CONNECTION_CONFLICT,
				exception.getMessage()
		);
	}

	private String eventType(SessionClientConnectionState state) {
		return switch (state) {
			case RECONNECTING -> "PARTICIPANT_RECONNECTING";
			case RECONNECTED -> "PARTICIPANT_RECONNECTED";
		};
	}
}
