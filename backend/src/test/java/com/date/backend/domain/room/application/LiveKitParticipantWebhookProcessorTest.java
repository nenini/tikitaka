package com.date.backend.domain.room.application;

import com.date.backend.domain.room.domain.LiveKitWebhookEvent;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.repository.LiveKitWebhookEventRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitParticipantWebhookProcessorTest {
	private static final LocalDateTime OCCURRED_AT =
			LocalDateTime.of(2026, 7, 29, 20, 0);

	private LiveKitWebhookEventRepository eventRepository;
	private RoomParticipantRepository participantRepository;
	private LiveKitParticipantWebhookProcessor processor;
	private RoomParticipant participant;

	@BeforeEach
	void setUp() {
		eventRepository = mock(LiveKitWebhookEventRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		processor = new LiveKitParticipantWebhookProcessor(
				eventRepository,
				participantRepository
		);
		participant = mock(RoomParticipant.class);
		when(participant.getParticipantIdentity()).thenReturn("user-101");
		when(participantRepository.findByLiveKitRoomNameAndUserIdForUpdate(
				"date-room-30",
				101L
		)).thenReturn(Optional.of(participant));
	}

	@Test
	void joinedEventIsClaimedAndUpdatesParticipant() {
		when(participant.recordConnected(
				"user-101",
				"PA_101",
				OCCURRED_AT
		)).thenReturn(true);

		var result = processor.process(command(
				LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_JOINED
		));

		assertThat(result).isEqualTo(LiveKitWebhookHandlingResult.PROCESSED);
		verify(eventRepository).saveAndFlush(any(LiveKitWebhookEvent.class));
		verify(participant).recordConnected(
				"user-101",
				"PA_101",
				OCCURRED_AT
		);
	}

	@Test
	void unknownSessionParticipantIsStoredAndIgnored() {
		when(participantRepository.findByLiveKitRoomNameAndUserIdForUpdate(
				"date-room-30",
				101L
		)).thenReturn(Optional.empty());

		var result = processor.process(command(
				LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_LEFT
		));

		assertThat(result).isEqualTo(
				LiveKitWebhookHandlingResult.IGNORED_UNKNOWN_PARTICIPANT
		);
		verify(eventRepository).saveAndFlush(any(LiveKitWebhookEvent.class));
	}

	private LiveKitParticipantWebhookCommand command(
			LiveKitParticipantWebhookCommand.EventType eventType
	) {
		return new LiveKitParticipantWebhookCommand(
				"EV_101",
				eventType,
				"date-room-30",
				"user-101",
				"PA_101",
				101L,
				OCCURRED_AT,
				OCCURRED_AT.plusSeconds(1)
		);
	}
}
