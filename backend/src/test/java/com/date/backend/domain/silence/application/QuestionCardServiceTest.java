package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.domain.QuestionCard;
import com.date.backend.domain.silence.repository.QuestionCardRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QuestionCardServiceTest {

	@Test
	void participantReceivesRequestedNumberOfSafeActiveQuestions() {
		WaitingRoomRepository sessionRepository = mock(WaitingRoomRepository.class);
		RoomParticipantRepository participantRepository =
				mock(RoomParticipantRepository.class);
		QuestionCardRepository questionCardRepository =
				mock(QuestionCardRepository.class);
		WaitingRoom session = mock(WaitingRoom.class);
		when(sessionRepository.findById(15L)).thenReturn(Optional.of(session));
		when(session.isInProgress()).thenReturn(true);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		List<QuestionCard> cards =
				List.of(card(1L), card(2L), card(3L), card(4L));
		when(questionCardRepository
				.findAllByActiveTrueAndSensitiveFalseOrderByDisplayOrderAsc())
				.thenReturn(cards);
		QuestionCardService service = new QuestionCardService(
				sessionRepository,
				participantRepository,
				questionCardRepository
		);

		var response = service.getRandomQuestions(101L, 15L, 3);

		assertThat(response.questions()).hasSize(3);
	}

	private QuestionCard card(Long id) {
		QuestionCard card = mock(QuestionCard.class);
		when(card.getId()).thenReturn(id);
		when(card.getCode()).thenReturn("CODE_" + id);
		when(card.getCategory()).thenReturn("HOBBY");
		when(card.getContent()).thenReturn("질문 " + id);
		return card;
	}
}
