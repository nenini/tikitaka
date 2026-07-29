package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.dto.AiQuestionRecommendationRequest;
import com.date.backend.domain.silence.event.ContextualQuestionDeliveryEvent;
import com.date.backend.domain.silence.repository.QuestionRecommendationEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
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

class AiQuestionRecommendationServiceTest {
	private QuestionRecommendationEventRepository recommendationRepository;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoomRepository sessionRepository;
	private AiQuestionRecommendationService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		RoomParticipantRepository participantRepository =
				mock(RoomParticipantRepository.class);
		recommendationRepository =
				mock(QuestionRecommendationEventRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		WaitingRoom session = mock(WaitingRoom.class);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		when(session.getActualStartAt())
				.thenReturn(LocalDateTime.of(2026, 7, 30, 10, 0));
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(mock(RoomParticipant.class)));
		service = new AiQuestionRecommendationService(
				sessionRepository,
				participantRepository,
				recommendationRepository,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-30T01:00:30Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void deliversThreeContextualQuestionsToTarget() {
		var response = service.receive(request("question-1", 60_000));

		assertThat(response.status()).isEqualTo("DELIVERED");
		verify(recommendationRepository).saveAndFlush(any());
		verify(eventPublisher).publishEvent(any(ContextualQuestionDeliveryEvent.class));
	}

	@Test
	void expiredRecommendationIsStoredWithoutDelivery() {
		var response = service.receive(request("question-2", 20_000));

		assertThat(response.status()).isEqualTo("EXPIRED");
		verify(recommendationRepository).saveAndFlush(any());
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void duplicateRecommendationIsIdempotent() {
		when(recommendationRepository.existsByEventIdOrDeduplicationKey(
				"question-3",
				"dedup-question-3"
		)).thenReturn(true);

		var response = service.receive(request("question-3", 60_000));

		assertThat(response.status()).isEqualTo("DUPLICATE");
		verify(sessionRepository, never()).findWithMatchPairByIdForUpdate(any());
	}

	private AiQuestionRecommendationRequest request(
			String eventId,
			long expiresAt
	) {
		return new AiQuestionRecommendationRequest(
				"QUESTION_RECOMMENDATION_READY",
				1,
				eventId,
				"aggregator",
				"15",
				"101",
				20_000,
				expiresAt,
				"dedup-" + eventId,
				"전시와 여행을 이야기함",
				List.of(
						"최근 기억에 남은 전시가 있나요?",
						"다음에 가 보고 싶은 여행지는 어디인가요?",
						"여행지에서 가장 중요하게 보는 것은 무엇인가요?"
				),
				OffsetDateTime.parse("2026-07-30T01:00:25Z")
		);
	}
}
