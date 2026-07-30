package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.domain.SilenceInterventionStage;
import com.date.backend.domain.silence.dto.AiSilenceEventRequest;
import com.date.backend.domain.silence.dto.QuestionCardResponse;
import com.date.backend.domain.silence.event.SilenceInterventionEvent;
import com.date.backend.domain.silence.repository.SilenceEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiSilenceEventServiceTest {
	private WaitingRoomRepository sessionRepository;
	private SilenceEventRepository silenceEventRepository;
	private QuestionCardService questionCardService;
	private ApplicationEventPublisher eventPublisher;
	private AiSilenceEventService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		silenceEventRepository = mock(SilenceEventRepository.class);
		questionCardService = mock(QuestionCardService.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		WaitingRoom session = mock(WaitingRoom.class);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		service = new AiSilenceEventService(
				sessionRepository,
				silenceEventRepository,
				questionCardService,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-30T01:00:30Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void thirtySecondsSilenceDeliversGenericQuestionCards() {
		when(questionCardService.selectRandom(3)).thenReturn(List.of(
				new QuestionCardResponse(1L, "HOBBY_01", "HOBBY", "취미가 있나요?")
		));

		var response = service.receive(request("silence-1", 30_000));

		assertThat(response.interventionStage())
				.isEqualTo(SilenceInterventionStage.QUESTION_CARD);
		ArgumentCaptor<SilenceInterventionEvent> captor =
				ArgumentCaptor.forClass(SilenceInterventionEvent.class);
		verify(eventPublisher).publishEvent(captor.capture());
		assertThat(captor.getValue().payload().questions()).hasSize(1);
	}

	@Test
	void naturalSilenceIsStoredWithoutIntervention() {
		var response = service.receive(request("silence-2", 10_000));

		assertThat(response.interventionStage())
				.isEqualTo(SilenceInterventionStage.NONE);
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void duplicateEventIsIdempotent() {
		when(silenceEventRepository.existsById("silence-3")).thenReturn(true);

		var response = service.receive(request("silence-3", 30_000));

		assertThat(response.status()).isEqualTo("DUPLICATE");
		verify(sessionRepository, never()).findWithMatchPairByIdForUpdate(any());
	}

	private AiSilenceEventRequest request(String eventId, long durationMs) {
		return new AiSilenceEventRequest(
				"SILENCE_ANALYZED",
				1,
				eventId,
				"aggregator",
				"15",
				1_000,
				1_000 + durationMs,
				durationMs,
				OffsetDateTime.parse("2026-07-30T01:00:30Z")
		);
	}
}
