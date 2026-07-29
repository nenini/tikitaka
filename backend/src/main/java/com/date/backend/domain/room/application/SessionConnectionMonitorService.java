package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionRealtimeProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.event.SessionAbnormalTerminationRequestedEvent;
import com.date.backend.domain.room.event.SessionParticipantConnectionChangedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SessionConnectionMonitorService {
	private final RoomParticipantRepository participantRepository;
	private final SessionRealtimeProperties properties;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionConnectionMonitorService(
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
	public int detectHeartbeatTimeouts() {
		LocalDateTime now = LocalDateTime.now(clock);
		LocalDateTime heartbeatCutoff = now.minus(
				properties.heartbeatTimeout()
		);
		List<RoomParticipant> timedOutParticipants =
				participantRepository.findHeartbeatTimedOutForUpdate(
						SessionConnectionStatus.CONNECTED,
						heartbeatCutoff,
						PageRequest.of(0, properties.monitorBatchSize())
				);

		int changedCount = 0;
		for (RoomParticipant participant : timedOutParticipants) {
			if (!participant.startReconnecting(
					now,
					now.plus(properties.reconnectGracePeriod())
			)) {
				continue;
			}
			changedCount++;
			eventPublisher.publishEvent(
					SessionParticipantConnectionChangedEvent.of(
							"PARTICIPANT_RECONNECTING",
							participant,
							now
					)
			);
		}
		return changedCount;
	}

	@Transactional
	public int failExpiredRecoveries() {
		LocalDateTime now = LocalDateTime.now(clock);
		List<RoomParticipant> expiredParticipants =
				participantRepository.findReconnectExpiredForUpdate(
						SessionConnectionStatus.RECONNECTING,
						now,
						PageRequest.of(0, properties.monitorBatchSize())
				);

		int changedCount = 0;
		for (RoomParticipant participant : expiredParticipants) {
			if (!participant.failRecovery(now)) {
				continue;
			}
			changedCount++;
			eventPublisher.publishEvent(
					SessionParticipantConnectionChangedEvent.of(
							"PARTICIPANT_RECOVERY_FAILED",
							participant,
							now
					)
			);
			eventPublisher.publishEvent(
					new SessionAbnormalTerminationRequestedEvent(
							participant.getRoomId(),
							participant.getUserId(),
							SessionAbnormalTerminationRequestedEvent
									.RECONNECT_TIMEOUT,
							now
					)
			);
		}
		return changedCount;
	}
}
