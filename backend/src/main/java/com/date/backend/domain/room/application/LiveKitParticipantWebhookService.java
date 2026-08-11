package com.date.backend.domain.room.application;

import com.date.backend.domain.room.repository.LiveKitWebhookEventRepository;
import livekit.LivekitModels.ParticipantInfo;
import livekit.LivekitWebhook.WebhookEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class LiveKitParticipantWebhookService {
	private static final Logger log =
			LoggerFactory.getLogger(LiveKitParticipantWebhookService.class);
	private static final String USER_IDENTITY_PREFIX = "user-";

	private final LiveKitParticipantWebhookProcessor processor;
	private final LiveKitWebhookEventRepository webhookEventRepository;
	private final Clock clock;

	public LiveKitParticipantWebhookService(
			LiveKitParticipantWebhookProcessor processor,
			LiveKitWebhookEventRepository webhookEventRepository,
			Clock clock
	) {
		this.processor = processor;
		this.webhookEventRepository = webhookEventRepository;
		this.clock = clock;
	}

	public LiveKitWebhookHandlingResult handle(WebhookEvent event) {
		Optional<LiveKitParticipantWebhookCommand.EventType> eventType =
				toEventType(event.getEvent());
		if (eventType.isEmpty()) {
			return LiveKitWebhookHandlingResult.IGNORED_UNSUPPORTED_EVENT;
		}
		if (!event.hasRoom() || !event.hasParticipant()) {
			log.warn(
					"LiveKit participant webhook payload is incomplete. eventId={}, type={}",
					event.getId(),
					event.getEvent()
			);
			return LiveKitWebhookHandlingResult.IGNORED_UNKNOWN_PARTICIPANT;
		}

		ParticipantInfo participant = event.getParticipant();
		Optional<Long> userId = parseUserId(participant.getIdentity());
		if (userId.isEmpty()) {
			return LiveKitWebhookHandlingResult.IGNORED_NON_USER_PARTICIPANT;
		}
		if (event.getId().isBlank()
				|| event.getRoom().getName().isBlank()
				|| participant.getSid().isBlank()
				|| event.getCreatedAt() <= 0) {
			log.warn(
					"LiveKit participant webhook fields are invalid. eventId={}, type={}",
					event.getId(),
					event.getEvent()
			);
			return LiveKitWebhookHandlingResult.IGNORED_UNKNOWN_PARTICIPANT;
		}

		LiveKitParticipantWebhookCommand command =
				new LiveKitParticipantWebhookCommand(
						event.getId(),
						eventType.get(),
						event.getRoom().getName(),
						participant.getIdentity(),
						participant.getSid(),
						userId.get(),
						LocalDateTime.ofInstant(
								Instant.ofEpochSecond(event.getCreatedAt()),
								clock.getZone()
						),
						LocalDateTime.now(clock)
				);

		try {
			return processor.process(command);
		} catch (DataIntegrityViolationException exception) {
			if (webhookEventRepository.existsById(command.eventId())) {
				return LiveKitWebhookHandlingResult.DUPLICATE;
			}
			throw exception;
		}
	}

	private Optional<LiveKitParticipantWebhookCommand.EventType> toEventType(
			String eventName
	) {
		return switch (eventName) {
			case "participant_joined" -> Optional.of(
					LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_JOINED
			);
			case "participant_left" -> Optional.of(
					LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_LEFT
			);
			case "participant_connection_aborted" -> Optional.of(
					LiveKitParticipantWebhookCommand.EventType
							.PARTICIPANT_CONNECTION_ABORTED
			);
			default -> Optional.empty();
		};
	}

	private Optional<Long> parseUserId(String participantIdentity) {
		if (participantIdentity == null
				|| !participantIdentity.startsWith(USER_IDENTITY_PREFIX)) {
			return Optional.empty();
		}

		String rawUserId = participantIdentity.substring(
				USER_IDENTITY_PREFIX.length()
		);
		if (rawUserId.isBlank()) {
			return Optional.empty();
		}

		try {
			long userId = Long.parseLong(rawUserId);
			return userId > 0 ? Optional.of(userId) : Optional.empty();
		} catch (NumberFormatException exception) {
			return Optional.empty();
		}
	}
}
