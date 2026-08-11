package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.dto.response.CoachingRequestAcceptedResponse;
import com.date.backend.domain.coach.integration.AiSessionEventClient;
import com.date.backend.domain.coach.integration.QuestionSuggestionResult;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CoachingRequestServiceTest {
	private static final Long SESSION_ID = 15L;
	private static final Long USER_ID = 1L;

	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private AiSessionEventClient aiSessionEventClient;
	private CoachingRequestService service;
	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		aiSessionEventClient = mock(AiSessionEventClient.class);
		service = new CoachingRequestService(
				sessionRepository,
				participantRepository,
				aiSessionEventClient
		);
		session = mock(WaitingRoom.class);
		when(sessionRepository.findById(SESSION_ID))
				.thenReturn(Optional.of(session));
		when(participantRepository.existsByRoom_IdAndUserId(SESSION_ID, USER_ID))
				.thenReturn(true);
		when(session.isInProgress()).thenReturn(true);
	}

	@Test
	void acceptedRequestReturnsRequestId() {
		when(aiSessionEventClient.requestQuestionSuggestion(
				eq(SESSION_ID),
				eq(USER_ID),
				any()
		)).thenReturn(QuestionSuggestionResult.CREATED);

		CoachingRequestAcceptedResponse response =
				service.request(USER_ID, SESSION_ID);

		assertThat(response.requestId()).isNotBlank();
	}

	@Test
	void unavailableSuggestionIsReportedToTheUser() {
		when(aiSessionEventClient.requestQuestionSuggestion(
				any(),
				any(),
				any()
		)).thenReturn(QuestionSuggestionResult.UNAVAILABLE);

		assertThatThrownBy(() -> service.request(USER_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								CoachErrorCode.COACHING_REQUEST_UNAVAILABLE
						)
				);
	}

	@Test
	void missingAiConfigurationLooksTheSameToTheUser() {
		// 설정이 없는 것은 서버 사정이다. 화면은 "지금은 추천을 만들지 못했어요"만
		// 보여주면 되므로 UNAVAILABLE 과 같은 코드로 내린다.
		when(aiSessionEventClient.requestQuestionSuggestion(
				any(),
				any(),
				any()
		)).thenReturn(QuestionSuggestionResult.NOT_CONFIGURED);

		assertThatThrownBy(() -> service.request(USER_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								CoachErrorCode.COACHING_REQUEST_UNAVAILABLE
						)
				);
	}

	@Test
	void aiSaysTheSessionIsGoneEvenThoughTheRowSaysInProgress() {
		when(aiSessionEventClient.requestQuestionSuggestion(
				any(),
				any(),
				any()
		)).thenReturn(QuestionSuggestionResult.SESSION_NOT_ACTIVE);

		assertThatThrownBy(() -> service.request(USER_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								CoachErrorCode.COACHING_REQUEST_SESSION_NOT_ACTIVE
						)
				);
	}

	@Test
	void sessionThatHasNotStartedIsRejectedBeforeCallingAi() {
		when(session.isInProgress()).thenReturn(false);

		assertThatThrownBy(() -> service.request(USER_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								CoachErrorCode.COACHING_REQUEST_SESSION_NOT_ACTIVE
						)
				);
		verify(aiSessionEventClient, never())
				.requestQuestionSuggestion(any(), any(), any());
	}

	@Test
	void nonParticipantCannotRequestCoachingForSomeoneElsesSession() {
		when(participantRepository.existsByRoom_IdAndUserId(SESSION_ID, 999L))
				.thenReturn(false);

		assertThatThrownBy(() -> service.request(999L, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_NOT_PARTICIPANT
						)
				);
		verify(aiSessionEventClient, never())
				.requestQuestionSuggestion(any(), any(), any());
	}

	@Test
	void unknownSessionIsNotFound() {
		when(sessionRepository.findById(404L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.request(USER_ID, 404L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_NOT_FOUND
						)
				);
	}

	@Test
	void everyRequestGetsItsOwnId() {
		when(aiSessionEventClient.requestQuestionSuggestion(any(), any(), any()))
				.thenReturn(QuestionSuggestionResult.CREATED);

		String first = service.request(USER_ID, SESSION_ID).requestId();
		String second = service.request(USER_ID, SESSION_ID).requestId();

		// 중복키가 겹치면 BE 중복 차단이 두 번째 요청을 조용히 버린다.
		assertThat(first).isNotEqualTo(second);
	}
}
