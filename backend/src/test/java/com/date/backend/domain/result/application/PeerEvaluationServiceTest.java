package com.date.backend.domain.result.application;

import com.date.backend.domain.result.repository.PeerEvaluationRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ResultErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PeerEvaluationServiceTest {
	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private PeerEvaluationRepository evaluationRepository;
	private PeerEvaluationService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		evaluationRepository = mock(PeerEvaluationRepository.class);
		service = new PeerEvaluationService(
				sessionRepository,
				participantRepository,
				evaluationRepository
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

	private void givenCompletedSession() {
		WaitingRoom session = mock(WaitingRoom.class);
		RoomParticipant first = mock(RoomParticipant.class);
		RoomParticipant second = mock(RoomParticipant.class);
		when(session.getStatus()).thenReturn(RoomSessionStatus.COMPLETED);
		when(first.getUserId()).thenReturn(10L);
		when(second.getUserId()).thenReturn(20L);
		when(sessionRepository.findWithMatchPairById(1L))
				.thenReturn(Optional.of(session));
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(1L))
				.thenReturn(List.of(first, second));
	}
}
