package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.domain.AiAnalysisType;
import com.date.backend.domain.coach.dto.AiAnalysisEventRequest;
import com.date.backend.domain.coach.repository.AiSessionAnalysisEventRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiAnalysisEventServiceTest {
	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private AiSessionAnalysisEventRepository eventRepository;
	private WaitingRoom session;
	private RoomParticipant participant;
	private AiAnalysisEventService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		eventRepository = mock(AiSessionAnalysisEventRepository.class);
		session = mock(WaitingRoom.class);
		participant = mock(RoomParticipant.class);
		Clock clock = Clock.fixed(
				Instant.parse("2026-07-30T01:00:30Z"),
				ZoneId.of("Asia/Seoul")
		);
		service = new AiAnalysisEventService(
				sessionRepository,
				participantRepository,
				eventRepository,
				new ObjectMapper(),
				clock
		);
		when(sessionRepository.findById(15L)).thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(participant));
		when(participant.getParticipantIdentity()).thenReturn("user-101");
		when(participant.isVoiceAnalysisEnabled()).thenReturn(true);
		when(participant.isExpressionAnalysisEnabled()).thenReturn(true);
	}

	@Test
	void storesVoiceAnalysisResult() {
		var response = service.receive(AiAnalysisType.VOICE, request("event-1"));

		assertThat(response.status()).isEqualTo("STORED");
		verify(eventRepository).saveAndFlush(any());
	}

	@Test
	void duplicateEventIsIdempotent() {
		when(eventRepository.existsById("event-1")).thenReturn(true);

		var response = service.receive(AiAnalysisType.VISION, request("event-1"));

		assertThat(response.status()).isEqualTo("DUPLICATE");
		verify(sessionRepository, never()).findById(any());
		verify(eventRepository, never()).saveAndFlush(any());
	}

	@Test
	void rejectsParticipantIdentityMismatch() {
		AiAnalysisEventRequest request = new AiAnalysisEventRequest(
				"event-2", 2, "TRANSCRIPT_FINALIZED", "WHISPER_STT",
				"15", "101", "user-999", "client-1", 1L, 1000L,
				new BigDecimal("0.91"), OffsetDateTime.parse("2026-07-30T01:00:01Z"),
				"whisper-v3", "stt-rule-v1",
				Map.of("text", "안녕하세요")
		);

		assertThatThrownBy(() -> service.receive(AiAnalysisType.VOICE, request))
				.isInstanceOfSatisfying(
						BusinessException.class,
						exception -> assertThat(exception.getErrorCode())
								.isEqualTo(CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE)
				);
	}

	@Test
	void rejectsAnalysisWithoutConsent() {
		when(participant.isExpressionAnalysisEnabled()).thenReturn(false);

		assertThatThrownBy(() -> service.receive(
				AiAnalysisType.VISION,
				request("event-3")
		)).isInstanceOfSatisfying(
				BusinessException.class,
				exception -> assertThat(exception.getErrorCode())
						.isEqualTo(CoachErrorCode.AI_ANALYSIS_CONSENT_REQUIRED)
		);
	}

	@Test
	void acceptsFinalVisionEventImmediatelyAfterSessionEnd() {
		when(session.isInProgress()).thenReturn(false);
		when(session.isEnded()).thenReturn(true);
		when(session.getActualEndAt()).thenReturn(LocalDateTime.of(2026, 7, 30, 10, 0, 25));

		var response = service.receive(AiAnalysisType.VISION, request("event-final-vision"));

		assertThat(response.status()).isEqualTo("STORED");
		verify(eventRepository).saveAndFlush(any());
	}

	private AiAnalysisEventRequest request(String eventId) {
		return new AiAnalysisEventRequest(
				eventId, 4, "VISION_METRIC_SNAPSHOT", "VISION_PIPELINE",
				"15", "101", "user-101", "client-1", 1L, 1000L,
				new BigDecimal("0.91"), OffsetDateTime.parse("2026-07-30T01:00:01Z"),
				"mediapipe-v1", "vision-rule-v4",
				Map.of("attentionScore", 84)
		);
	}
}
