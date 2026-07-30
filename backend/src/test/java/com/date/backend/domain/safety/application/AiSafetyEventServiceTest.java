package com.date.backend.domain.safety.application;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.SessionAbnormalTerminationRequestedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetySeverity;
import com.date.backend.domain.safety.dto.AiSafetyEventRequest;
import com.date.backend.domain.safety.dto.SafetyWarningResponse;
import com.date.backend.domain.safety.event.SafetyWarningDeliveryEvent;
import com.date.backend.domain.safety.repository.SafetyEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiSafetyEventServiceTest {
	private WaitingRoomRepository sessionRepository;
	private SafetyEventRepository safetyEventRepository;
	private ApplicationEventPublisher eventPublisher;
	private AiSafetyEventService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		RoomParticipantRepository participantRepository =
				mock(RoomParticipantRepository.class);
		safetyEventRepository = mock(SafetyEventRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		WaitingRoom session = mock(WaitingRoom.class);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		when(participantRepository.findByRoomIdAndUserIdForUpdate(15L, 101L))
				.thenReturn(Optional.of(mock(RoomParticipant.class)));
		service = new AiSafetyEventService(
				sessionRepository,
				participantRepository,
				safetyEventRepository,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-30T01:00:30Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void storesDetectionAndWarnsOnlyDetectedUser() {
		var response = service.receive(request("safety-1", "dedup-1"));

		assertThat(response.status()).isEqualTo("DELIVERED");
		assertThat(response.effectiveSeverity()).isEqualTo(SafetySeverity.LOW);
		verify(safetyEventRepository).saveAndFlush(any());
		ArgumentCaptor<SafetyWarningDeliveryEvent> captor =
				ArgumentCaptor.forClass(SafetyWarningDeliveryEvent.class);
		verify(eventPublisher).publishEvent(captor.capture());
		assertThat(captor.getValue().targetUserId()).isEqualTo(101L);
	}

	@Test
	void repeatedHighRiskDetectionShowsOptionsButDoesNotTerminateSession() {
		when(safetyEventRepository.countBySessionIdAndUserIdAndCategory(
				15L,
				101L,
				SafetyCategory.PERSONAL_INFORMATION_REQUEST
		)).thenReturn(4L);

		var response = service.receive(request("safety-2", "dedup-2"));

		assertThat(response.effectiveSeverity()).isEqualTo(SafetySeverity.HIGH);
		ArgumentCaptor<SafetyWarningDeliveryEvent> captor =
				ArgumentCaptor.forClass(SafetyWarningDeliveryEvent.class);
		verify(eventPublisher).publishEvent(captor.capture());
		assertThat(captor.getValue().payload().recommendedAction())
				.isEqualTo(SafetyWarningResponse.REPORT_OR_LEAVE_OPTIONS);
		verify(eventPublisher, never()).publishEvent(
				any(SessionAbnormalTerminationRequestedEvent.class)
		);
	}

	@Test
	void duplicateDetectionIsIdempotent() {
		when(safetyEventRepository.existsByEventIdOrDeduplicationKey(
				"safety-3",
				"dedup-3"
		)).thenReturn(true);

		var response = service.receive(request("safety-3", "dedup-3"));

		assertThat(response.status()).isEqualTo("DUPLICATE");
		verify(sessionRepository, never()).findWithMatchPairByIdForUpdate(any());
	}

	private AiSafetyEventRequest request(String eventId, String deduplicationKey) {
		return new AiSafetyEventRequest(
				"SAFETY_EVENT_DETECTED",
				1,
				eventId,
				"aggregator",
				"15",
				"101",
				SafetyCategory.PERSONAL_INFORMATION_REQUEST,
				SafetySeverity.LOW,
				"REPEATED_CONTACT_REQUEST",
				"개인정보를 묻는 질문은 상대가 부담스럽게 느낄 수 있어요.",
				new BigDecimal("0.91"),
				deduplicationKey,
				30_000,
				OffsetDateTime.parse("2026-07-30T01:00:30Z")
		);
	}
}
