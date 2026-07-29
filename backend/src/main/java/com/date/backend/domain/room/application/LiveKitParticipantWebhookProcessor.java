package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionRealtimeProperties;
import com.date.backend.domain.room.domain.LiveKitWebhookEvent;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.event.SessionParticipantConnectionChangedEvent;
import com.date.backend.domain.room.repository.LiveKitWebhookEventRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LiveKitParticipantWebhookProcessor {
	private final LiveKitWebhookEventRepository webhookEventRepository;
	private final RoomParticipantRepository participantRepository;
	private final SessionRealtimeProperties realtimeProperties;
	private final ApplicationEventPublisher eventPublisher;

	public LiveKitParticipantWebhookProcessor(
			LiveKitWebhookEventRepository webhookEventRepository,
			RoomParticipantRepository participantRepository,
			SessionRealtimeProperties realtimeProperties,
			ApplicationEventPublisher eventPublisher
	) {
		this.webhookEventRepository = webhookEventRepository;
		this.participantRepository = participantRepository;
		this.realtimeProperties = realtimeProperties;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public LiveKitWebhookHandlingResult process(
			LiveKitParticipantWebhookCommand command
	) {
		webhookEventRepository.saveAndFlush(new LiveKitWebhookEvent(
				command.eventId(),
				toEventName(command.eventType()),
				command.roomName(),
				command.participantIdentity(),
				command.receivedAt()
		));

		RoomParticipant participant = participantRepository
				.findByLiveKitRoomNameAndUserIdForUpdate(
						command.roomName(),
						command.userId()
				)
				.orElse(null);
		if (participant == null
				|| !participant.getParticipantIdentity()
				.equals(command.participantIdentity())) {
			return LiveKitWebhookHandlingResult.IGNORED_UNKNOWN_PARTICIPANT;
		}

		boolean changed = switch (command.eventType()) {
			case PARTICIPANT_JOINED -> participant.recordConnected(
					command.participantIdentity(),
					command.participantSid(),
					command.occurredAt()
			);
			case PARTICIPANT_LEFT -> handleParticipantLeft(
					participant,
					command
			);
			case PARTICIPANT_CONNECTION_ABORTED -> handleConnectionAborted(
					participant,
					command
			);
		};

		if (!changed) {
			return LiveKitWebhookHandlingResult.IGNORED_STALE_CONNECTION;
		}
		eventPublisher.publishEvent(
				SessionParticipantConnectionChangedEvent.of(
						eventType(participant),
						participant,
						command.occurredAt()
				)
		);
		return LiveKitWebhookHandlingResult.PROCESSED;
	}

	private boolean handleParticipantLeft(
			RoomParticipant participant,
			LiveKitParticipantWebhookCommand command
	) {
		if (participant.isSessionInProgress()) {
			return participant.startReconnectingForParticipantSid(
					command.participantSid(),
					command.occurredAt(),
					command.occurredAt().plus(
							realtimeProperties.reconnectGracePeriod()
					)
			);
		}
		return participant.recordDisconnected(
				command.participantIdentity(),
				command.participantSid(),
				command.occurredAt()
		);
	}

	private boolean handleConnectionAborted(
			RoomParticipant participant,
			LiveKitParticipantWebhookCommand command
	) {
		if (participant.isSessionInProgress()) {
			return participant.startReconnectingForParticipantSid(
					command.participantSid(),
					command.occurredAt(),
					command.occurredAt().plus(
							realtimeProperties.reconnectGracePeriod()
					)
			);
		}
		return participant.recordConnectionAborted(
				command.participantIdentity(),
				command.participantSid(),
				command.occurredAt()
		);
	}

	private String eventType(RoomParticipant participant) {
		return switch (participant.getConnectionStatus()) {
			case CONNECTED -> "PARTICIPANT_CONNECTED";
			case RECONNECTING -> "PARTICIPANT_RECONNECTING";
			case DISCONNECTED -> "PARTICIPANT_DISCONNECTED";
		};
	}

	private String toEventName(
			LiveKitParticipantWebhookCommand.EventType eventType
	) {
		return switch (eventType) {
			case PARTICIPANT_JOINED -> "participant_joined";
			case PARTICIPANT_LEFT -> "participant_left";
			case PARTICIPANT_CONNECTION_ABORTED ->
					"participant_connection_aborted";
		};
	}
}
