package com.date.backend.domain.room.application;

import com.date.backend.domain.room.repository.LiveKitWebhookEventRepository;
import livekit.LivekitModels.ParticipantInfo;
import livekit.LivekitModels.Room;
import livekit.LivekitWebhook.WebhookEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitParticipantWebhookServiceTest {
	private LiveKitParticipantWebhookProcessor processor;
	private LiveKitWebhookEventRepository eventRepository;
	private LiveKitParticipantWebhookService service;

	@BeforeEach
	void setUp() {
		processor = mock(LiveKitParticipantWebhookProcessor.class);
		eventRepository = mock(LiveKitWebhookEventRepository.class);
		service = new LiveKitParticipantWebhookService(
				processor,
				eventRepository,
				Clock.fixed(
						Instant.parse("2026-07-29T11:00:01Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void convertsLiveKitParticipantEventToProcessingCommand() {
		when(processor.process(any())).thenReturn(
				LiveKitWebhookHandlingResult.PROCESSED
		);

		var result = service.handle(event(
				"participant_joined",
				"user-101",
				"PA_101"
		));

		assertThat(result).isEqualTo(LiveKitWebhookHandlingResult.PROCESSED);
		verify(processor).process(any(LiveKitParticipantWebhookCommand.class));
	}

	@Test
	void ignoresAgentParticipantWithoutUserIdentity() {
		var result = service.handle(event(
				"participant_joined",
				"ai-agent-session-30",
				"PA_agent"
		));

		assertThat(result).isEqualTo(
				LiveKitWebhookHandlingResult.IGNORED_NON_USER_PARTICIPANT
		);
	}

	@Test
	void duplicateEventIsAcknowledgedWithoutProcessingAgain() {
		when(processor.process(any())).thenThrow(
				new DataIntegrityViolationException("duplicate event")
		);
		when(eventRepository.existsById("EV_101")).thenReturn(true);

		var result = service.handle(event(
				"participant_left",
				"user-101",
				"PA_101"
		));

		assertThat(result).isEqualTo(LiveKitWebhookHandlingResult.DUPLICATE);
	}

	private WebhookEvent event(
			String eventName,
			String participantIdentity,
			String participantSid
	) {
		return WebhookEvent.newBuilder()
				.setId("EV_101")
				.setEvent(eventName)
				.setCreatedAt(1785332400L)
				.setRoom(Room.newBuilder().setName("date-room-30"))
				.setParticipant(ParticipantInfo.newBuilder()
						.setIdentity(participantIdentity)
						.setSid(participantSid))
				.build();
	}
}
