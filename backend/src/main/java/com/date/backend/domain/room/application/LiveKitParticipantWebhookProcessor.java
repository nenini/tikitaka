package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.LiveKitWebhookEvent;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.repository.LiveKitWebhookEventRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LiveKitParticipantWebhookProcessor {
	private final LiveKitWebhookEventRepository webhookEventRepository;
	private final RoomParticipantRepository participantRepository;

	public LiveKitParticipantWebhookProcessor(
			LiveKitWebhookEventRepository webhookEventRepository,
			RoomParticipantRepository participantRepository
	) {
		this.webhookEventRepository = webhookEventRepository;
		this.participantRepository = participantRepository;
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
			case PARTICIPANT_LEFT -> participant.recordDisconnected(
					command.participantIdentity(),
					command.participantSid(),
					command.occurredAt()
			);
			case PARTICIPANT_CONNECTION_ABORTED ->
					participant.recordConnectionAborted(
							command.participantIdentity(),
							command.participantSid(),
							command.occurredAt()
					);
		};

		return changed
				? LiveKitWebhookHandlingResult.PROCESSED
				: LiveKitWebhookHandlingResult.IGNORED_STALE_CONNECTION;
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
