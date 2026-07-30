package com.date.backend.domain.result.application;

import com.date.backend.domain.result.repository.PeerEvaluationRepository;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.result.domain.PeerEvaluation;
import com.date.backend.domain.result.event.PeerEvaluationsCompletedEvent;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ResultErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.any;

class PeerEvaluationServiceTest {
	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private PeerEvaluationRepository evaluationRepository;
	private PeerEvaluationService service;
	private ApplicationEventPublisher eventPublisher;
	private Clock clock;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		evaluationRepository = mock(PeerEvaluationRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		clock = Clock.fixed(
				Instant.parse("2026-07-30T03:00:00Z"),
				ZoneId.of("Asia/Seoul")
		);
		service = new PeerEvaluationService(
				sessionRepository,
				participantRepository,
				evaluationRepository,
				eventPublisher,
				clock,
				Duration.ofHours(48)
		);
	}

	@Test
	void secondSubmissionCompletesEvaluationAndRequestsReportOnce() {
		WaitingRoom session = givenCompletedSession();
		when(sessionRepository.findWithMatchPairByIdForUpdate(1L))
				.thenReturn(Optional.of(session));
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 10L))
				.thenReturn(false);
		when(evaluationRepository.saveAndFlush(any(PeerEvaluation.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		when(evaluationRepository.countBySessionId(1L)).thenReturn(2L);
		when(session.claimEvaluationCompletion(any())).thenReturn(true);

		var response = service.submit(10L, 1L, request());

		assertThat(response.allSubmitted()).isTrue();
		assertThat(response.reportRequested()).isTrue();
		verify(eventPublisher).publishEvent(any(PeerEvaluationsCompletedEvent.class));
	}

	@Test
	void rejectsDuplicateSubmission() {
		WaitingRoom session = givenCompletedSession();
		when(sessionRepository.findWithMatchPairByIdForUpdate(1L))
				.thenReturn(Optional.of(session));
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 10L))
				.thenReturn(true);

		assertThatThrownBy(() -> service.submit(10L, 1L, request()))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ResultErrorCode.EVALUATION_ALREADY_SUBMITTED)
				);
	}

	@Test
	void returnsItemsAndSubmissionStatusForParticipants() {
		givenCompletedSession();
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 10L))
				.thenReturn(true);
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 20L))
				.thenReturn(false);

		var items = service.getItems(10L, 1L);
		var status = service.getStatus(10L, 1L);

		assertThat(items.partnerUserId()).isEqualTo(20L);
		assertThat(items.items()).hasSize(6);
		assertThat(items.items()).allSatisfy(item -> {
			assertThat(item.minScore()).isEqualTo(1);
			assertThat(item.maxScore()).isEqualTo(5);
		});
		assertThat(status.mySubmitted()).isTrue();
		assertThat(status.partnerSubmitted()).isFalse();
		assertThat(status.allSubmitted()).isFalse();
		assertThat(status.deadlineAt())
				.isEqualTo(LocalDateTime.of(2026, 7, 31, 12, 0));
		assertThat(status.remainingSeconds()).isEqualTo(86_400);
		assertThat(status.submissionOpen()).isFalse();
		assertThat(status.resultAvailable()).isFalse();
		assertThat(status.resultPermanentlyLocked()).isFalse();
	}

	@Test
	void rejectsSubmissionAfterFortyEightHourDeadline() {
		WaitingRoom session = givenCompletedSession();
		when(session.getActualEndAt())
				.thenReturn(LocalDateTime.of(2026, 7, 28, 11, 59));
		when(sessionRepository.findWithMatchPairByIdForUpdate(1L))
				.thenReturn(Optional.of(session));
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 10L))
				.thenReturn(false);

		assertThatThrownBy(() -> service.submit(10L, 1L, request()))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ResultErrorCode.EVALUATION_DEADLINE_EXPIRED)
				);
	}

	@Test
	void permanentlyLocksResultWhenUserMissesDeadline() {
		WaitingRoom session = givenCompletedSession();
		when(session.getActualEndAt())
				.thenReturn(LocalDateTime.of(2026, 7, 28, 12, 0));
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 10L))
				.thenReturn(false);
		when(evaluationRepository.existsBySessionIdAndEvaluatorUserId(1L, 20L))
				.thenReturn(true);

		var status = service.getStatus(10L, 1L);

		assertThat(status.submissionOpen()).isFalse();
		assertThat(status.resultAvailable()).isFalse();
		assertThat(status.resultPermanentlyLocked()).isTrue();
		assertThat(status.remainingSeconds()).isZero();
		assertThatThrownBy(() -> service.getResult(10L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ResultErrorCode.EVALUATION_RESULT_LOCKED)
				);
	}

	@Test
	void rejectsSessionThatIsNotCompleted() {
		WaitingRoom session = mock(WaitingRoom.class);
		when(session.getStatus()).thenReturn(RoomSessionStatus.IN_PROGRESS);
		when(sessionRepository.findWithMatchPairById(1L))
				.thenReturn(Optional.of(session));

		assertThatThrownBy(() -> service.getItems(10L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ResultErrorCode.EVALUATION_SESSION_NOT_COMPLETED)
				);
	}

	private WaitingRoom givenCompletedSession() {
		WaitingRoom session = mock(WaitingRoom.class);
		RoomParticipant first = mock(RoomParticipant.class);
		RoomParticipant second = mock(RoomParticipant.class);
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);
		when(session.getActualEndAt())
				.thenReturn(LocalDateTime.of(2026, 7, 29, 12, 0));
		when(first.getUserId()).thenReturn(10L);
		when(second.getUserId()).thenReturn(20L);
		when(sessionRepository.findWithMatchPairById(1L))
				.thenReturn(Optional.of(session));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(1L))
				.thenReturn(List.of(first, second));
		return session;
	}

	private PeerEvaluationSubmitRequest request() {
		return new PeerEvaluationSubmitRequest(
				5, 4, 5, 4, 5, 5,
				"배려가 좋았어요.", "조금 더 질문해 주세요."
		);
	}
}
