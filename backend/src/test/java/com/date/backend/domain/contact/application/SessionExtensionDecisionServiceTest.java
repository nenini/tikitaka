package com.date.backend.domain.contact.application;

import com.date.backend.domain.contact.domain.ContactDecision;
import com.date.backend.domain.contact.domain.ContactDecisionStatus;
import com.date.backend.domain.contact.domain.ContactExchangeRequest;
import com.date.backend.domain.contact.event.SessionExtensionDecisionChangedEvent;
import com.date.backend.domain.contact.repository.ContactExchangeRequestRepository;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.room.application.SessionTerminationService;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.LiveKitRoomDeletionRequestedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionExtensionDecisionServiceTest {
	private static final LocalDateTime STARTED_AT =
			LocalDateTime.of(2026, 7, 31, 20, 0);
	private static final Clock DECISION_WINDOW_CLOCK = Clock.fixed(
			Instant.parse("2026-07-31T11:31:00Z"),
			ZoneId.of("Asia/Seoul")
	);

	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private ContactExchangeRequestRepository decisionRepository;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoom session;
	private List<RoomParticipant> participants;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		decisionRepository = mock(ContactExchangeRequestRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);

		MatchPair matchPair = mock(MatchPair.class);
		when(matchPair.getId()).thenReturn(10L);
		when(matchPair.getScheduledAt()).thenReturn(STARTED_AT);
		session = new WaitingRoom(matchPair);
		ReflectionTestUtils.setField(session, "id", 15L);
		ReflectionTestUtils.setField(
				session,
				"status",
				RoomSessionStatus.READY
		);
		session.start(STARTED_AT);

		participants = List.of(
				new RoomParticipant(session, 1L, "A"),
				new RoomParticipant(session, 2L, "B")
		);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(15L))
				.thenReturn(participants);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 1L))
				.thenReturn(true);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 2L))
				.thenReturn(true);
	}

	@Test
	void firstAgreementCreatesPendingDecisionWithoutEndingSession() {
		when(decisionRepository.findBySession_Id(15L))
				.thenReturn(Optional.empty());
		SessionTerminationService terminationService = mock(
				SessionTerminationService.class
		);
		SessionExtensionDecisionService service = service(
				DECISION_WINDOW_CLOCK,
				terminationService
		);

		var response = service.decide(1L, 15L, ContactDecision.AGREE);

		assertThat(response.status())
				.isEqualTo(ContactDecisionStatus.PENDING);
		assertThat(response.requesterUserId()).isEqualTo(1L);
		assertThat(response.targetUserId()).isEqualTo(2L);
		assertThat(response.scheduledEndAt())
				.isEqualTo(STARTED_AT.plusMinutes(35));
		verify(decisionRepository).save(any(ContactExchangeRequest.class));
		verify(terminationService, never())
				.terminateForContactDecline(any(), any(), any());
		verify(eventPublisher).publishEvent(
				any(SessionExtensionDecisionChangedEvent.class)
		);
	}

	@Test
	void secondAgreementKeepsSessionRunningUntilPlannedEnd() {
		ContactExchangeRequest stored = pendingAgreement();
		when(decisionRepository.findBySession_Id(15L))
				.thenReturn(Optional.of(stored));
		SessionTerminationService terminationService = mock(
				SessionTerminationService.class
		);
		SessionExtensionDecisionService service = service(
				DECISION_WINDOW_CLOCK,
				terminationService
		);

		var response = service.decide(2L, 15L, ContactDecision.AGREE);

		assertThat(response.status())
				.isEqualTo(ContactDecisionStatus.AGREED);
		assertThat(response.sessionStatus())
				.isEqualTo(RoomSessionStatus.IN_PROGRESS);
		verify(terminationService, never())
				.terminateForContactDecline(any(), any(), any());
	}

	@Test
	void oneDeclineCancelsSessionThroughExistingTerminationFlow() {
		ContactExchangeRequest stored = pendingAgreement();
		when(decisionRepository.findBySession_Id(15L))
				.thenReturn(Optional.of(stored));
		SessionTerminationService terminationService =
				new SessionTerminationService(
						sessionRepository,
						participantRepository,
						eventPublisher,
						DECISION_WINDOW_CLOCK
				);
		SessionExtensionDecisionService service = service(
				DECISION_WINDOW_CLOCK,
				terminationService
		);

		var response = service.decide(2L, 15L, ContactDecision.DECLINE);

		assertThat(response.status())
				.isEqualTo(ContactDecisionStatus.DECLINED);
		assertThat(response.sessionStatus())
				.isEqualTo(RoomSessionStatus.CANCELLED);
		assertThat(response.actualEndAt())
				.isEqualTo(LocalDateTime.of(2026, 7, 31, 20, 31));
		assertThat(session.getTerminationReason())
				.isEqualTo(SessionTerminationReason.CONTACT_DECLINED.name());
		verify(eventPublisher).publishEvent(
				new LiveKitRoomDeletionRequestedEvent(
						15L,
						session.getLivekitRoomName()
				)
		);
	}

	@Test
	void decisionBeforeLastFiveMinutesIsRejected() {
		Clock tooEarlyClock = Clock.fixed(
				Instant.parse("2026-07-31T11:29:59Z"),
				ZoneId.of("Asia/Seoul")
		);
		SessionExtensionDecisionService service = service(
				tooEarlyClock,
				mock(SessionTerminationService.class)
		);

		assertThatThrownBy(() ->
				service.decide(1L, 15L, ContactDecision.AGREE)
		).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_EXTENSION_WINDOW_NOT_OPEN
				)
		);

		verify(decisionRepository, never()).save(any());
	}

	private SessionExtensionDecisionService service(
			Clock clock,
			SessionTerminationService terminationService
	) {
		return new SessionExtensionDecisionService(
				sessionRepository,
				participantRepository,
				decisionRepository,
				terminationService,
				eventPublisher,
				clock
		);
	}

	private ContactExchangeRequest pendingAgreement() {
		return new ContactExchangeRequest(
				session,
				1L,
				2L,
				ContactDecision.AGREE,
				STARTED_AT.plusMinutes(30)
		);
	}
}
