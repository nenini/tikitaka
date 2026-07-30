package com.date.backend.domain.room.event;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiSessionLifecycleEventTest {

	@Test
	void createsStartedEventWithParticipantIdentityMapping() {
		RoomParticipant participantA = participant(
				101L,
				"user-101",
				true,
				false
		);
		RoomParticipant participantB = participant(
				202L,
				"user-202",
				true,
				true
		);
		Instant startedAt = Instant.parse("2026-07-29T05:10:00Z");

		AiSessionStartedEvent event = AiSessionStartedEvent.of(
				15L,
				startedAt,
				new AiSessionLiveKitConnection(
						"wss://livekit.example",
						"date-room-15",
						"ai-worker-token",
						"ai-session-15"
				),
				List.of(participantA, participantB)
		);

		assertThat(event.eventType()).isEqualTo("AI_SESSION_STARTED");
		assertThat(event.version()).isEqualTo(1);
		assertThat(event.sessionId()).isEqualTo("15");
		assertThat(event.actualStartAt()).isEqualTo(startedAt);
		assertThat(event.liveKit().roomName()).isEqualTo("date-room-15");
		assertThat(event.liveKit().participantIdentity())
				.isEqualTo("ai-session-15");
		assertThat(event.participants()).containsExactly(
				new AiSessionParticipantContext(
						"101",
						"user-101",
						false,
						true
				),
				new AiSessionParticipantContext(
						"202",
						"user-202",
						true,
						true
				)
		);
		assertThat(event.features().sttEnabled()).isTrue();
		assertThat(event.features().visionEnabled()).isTrue();
		assertThat(event.features().coachingEnabled()).isTrue();
	}

	@Test
	void mapsSessionTerminationReasonToAiContract() {
		Instant endedAt = Instant.parse("2026-07-29T05:40:00Z");

		AiSessionEndedEvent timeout = AiSessionEndedEvent.of(
				15L,
				endedAt,
				SessionTerminationReason.TIME_EXPIRED
		);
		AiSessionEndedEvent participantLeft = AiSessionEndedEvent.of(
				15L,
				endedAt,
				SessionTerminationReason.RECONNECT_TIMEOUT
		);

		assertThat(timeout.reason())
				.isEqualTo(AiSessionEndedEvent.AiSessionEndReason.TIMEOUT);
		assertThat(participantLeft.reason())
				.isEqualTo(
						AiSessionEndedEvent.AiSessionEndReason.PARTICIPANT_LEFT
				);
	}

	private RoomParticipant participant(
			Long userId,
			String participantIdentity,
			boolean expressionAnalysisEnabled,
			boolean voiceAnalysisEnabled
	) {
		RoomParticipant participant = mock(RoomParticipant.class);
		when(participant.getUserId()).thenReturn(userId);
		when(participant.getParticipantIdentity())
				.thenReturn(participantIdentity);
		when(participant.isExpressionAnalysisEnabled())
				.thenReturn(expressionAnalysisEnabled);
		when(participant.isVoiceAnalysisEnabled())
				.thenReturn(voiceAnalysisEnabled);
		return participant;
	}
}
