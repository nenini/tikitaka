package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.dto.request.SessionMediaStateRequest;
import com.date.backend.domain.room.dto.request.SessionNetworkQualityRequest;
import com.date.backend.domain.room.event.SessionParticipantRealtimeStateChangedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class SessionRealtimeStateService {
	private final RoomParticipantRepository participantRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionRealtimeStateService(
			RoomParticipantRepository participantRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.participantRepository = participantRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public void updateMediaState(
			Long userId,
			Long sessionId,
			SessionMediaStateRequest request
	) {
		RoomParticipant participant = findInProgressParticipant(
				userId,
				sessionId
		);
		LocalDateTime now = LocalDateTime.now(clock);
		boolean changed;
		try {
			changed = participant.updateMediaState(
					request.participantSid(),
					request.clientInstanceId(),
					request.cameraEnabled(),
					request.microphoneEnabled(),
					now
			);
		} catch (IllegalArgumentException | IllegalStateException exception) {
			throw connectionConflict(exception);
		}
		publishIfChanged(
				changed,
				"PARTICIPANT_MEDIA_STATE_CHANGED",
				participant,
				now
		);
	}

	@Transactional
	public void updateNetworkQuality(
			Long userId,
			Long sessionId,
			SessionNetworkQualityRequest request
	) {
		RoomParticipant participant = findInProgressParticipant(
				userId,
				sessionId
		);
		LocalDateTime now = LocalDateTime.now(clock);
		boolean changed;
		try {
			changed = participant.updateNetworkQuality(
					request.participantSid(),
					request.clientInstanceId(),
					request.networkQuality(),
					now
			);
		} catch (IllegalArgumentException | IllegalStateException exception) {
			throw connectionConflict(exception);
		}
		publishIfChanged(
				changed,
				"PARTICIPANT_NETWORK_QUALITY_CHANGED",
				participant,
				now
		);
	}

	private RoomParticipant findInProgressParticipant(
			Long userId,
			Long sessionId
	) {
		RoomParticipant participant = participantRepository
				.findByRoomIdAndUserIdForUpdate(sessionId, userId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_PARTICIPANT
				));
		if (!participant.isSessionInProgress()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_NOT_IN_PROGRESS
			);
		}
		return participant;
	}

	private void publishIfChanged(
			boolean changed,
			String eventType,
			RoomParticipant participant,
			LocalDateTime occurredAt
	) {
		if (changed) {
			eventPublisher.publishEvent(
					SessionParticipantRealtimeStateChangedEvent.of(
							eventType,
							participant,
							occurredAt
					)
			);
		}
	}

	private BusinessException connectionConflict(RuntimeException exception) {
		return new BusinessException(
				SessionErrorCode.SESSION_CONNECTION_CONFLICT,
				exception.getMessage()
		);
	}
}
