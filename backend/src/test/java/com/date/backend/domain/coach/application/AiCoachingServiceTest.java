package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.config.AiSessionProperties;
import com.date.backend.domain.coach.domain.CoachingDeliveryStatus;
import com.date.backend.domain.coach.domain.CoachingPriority;
import com.date.backend.domain.coach.domain.CoachingType;
import com.date.backend.domain.coach.dto.AiCoachingRequest;
import com.date.backend.domain.coach.event.CoachingMessageDeliveryEvent;
import com.date.backend.domain.coach.repository.AiCoachingEventRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiCoachingServiceTest {
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 30, 10, 0, 5);

	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private AiCoachingEventRepository coachingEventRepository;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoom session;
	private AiCoachingService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		coachingEventRepository = mock(AiCoachingEventRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		session = mock(WaitingRoom.class);
		Clock clock = Clock.fixed(
				Instant.parse("2026-07-30T01:00:05Z"),
				ZoneId.of("Asia/Seoul")
		);
		service = new AiCoachingService(
				sessionRepository,
				participantRepository,
				coachingEventRepository,
				new AiSessionProperties("secret", Duration.ofSeconds(10)),
				eventPublisher,
				clock
		);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		when(session.getActualStartAt()).thenReturn(NOW.minusSeconds(5));
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(mock(RoomParticipant.class)));
	}

	@Test
	void storesAndPublishesDeliverableCoaching() {
		var response = service.receive(request("event-1", "dedup-1", 10_000));

		assertThat(response.status()).isEqualTo("DELIVERED");
		verify(coachingEventRepository).saveAndFlush(any());
		ArgumentCaptor<CoachingMessageDeliveryEvent> captor =
				ArgumentCaptor.forClass(CoachingMessageDeliveryEvent.class);
		verify(eventPublisher).publishEvent(captor.capture());
		assertThat(captor.getValue().targetUserId()).isEqualTo(101L);
		assertThat(captor.getValue().payload().messageText())
				.isEqualTo("짧은 맞장구로 반응해 보세요.");
	}

	@Test
	void expiredCoachingIsStoredWithoutDelivery() {
		var response = service.receive(request("event-2", "dedup-2", 4_000));

		assertThat(response.status()).isEqualTo("EXPIRED");
		verify(coachingEventRepository).saveAndFlush(any());
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void recentSameTypeCoachingIsSuppressed() {
		when(coachingEventRepository
				.existsBySessionIdAndTargetUserIdAndCoachingTypeAndDeliveryStatusAndDeliveredAtGreaterThanEqual(
						eq(15L),
						eq(101L),
						eq(CoachingType.REACTION_PROMPT),
						eq(CoachingDeliveryStatus.DELIVERED),
						any(LocalDateTime.class)
				)).thenReturn(true);

		var response = service.receive(request("event-3", "dedup-3", 10_000));

		assertThat(response.status()).isEqualTo("SUPPRESSED");
		verify(eventPublisher, never()).publishEvent(any());
	}

	@Test
	void duplicatedEventDoesNotLockSessionOrDeliver() {
		when(coachingEventRepository.existsByEventIdOrDeduplicationKey(
				"event-4",
				"dedup-4"
		)).thenReturn(true);

		var response = service.receive(request("event-4", "dedup-4", 10_000));

		assertThat(response.status()).isEqualTo("DUPLICATE");
		verify(sessionRepository, never()).findWithMatchPairByIdForUpdate(any());
		verify(eventPublisher, never()).publishEvent(any());
	}

	private AiCoachingRequest request(
			String eventId,
			String deduplicationKey,
			long expiresAt
	) {
		return new AiCoachingRequest(
				"COACHING_REQUESTED",
				2,
				eventId,
				OffsetDateTime.parse("2026-07-30T01:00:04Z"),
				"aggregator",
				"15",
				"101",
				CoachingType.REACTION_PROMPT,
				"REACTION_PROMPT_01",
				"짧은 맞장구로 반응해 보세요.",
				CoachingPriority.LOW,
				"LONG_TALK_WITHOUT_VERBAL_REACTION",
				4_000,
				expiresAt,
				deduplicationKey
		);
	}
}
