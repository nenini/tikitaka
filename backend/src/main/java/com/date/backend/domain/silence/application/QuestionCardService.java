package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.domain.QuestionCard;
import com.date.backend.domain.silence.dto.QuestionCardListResponse;
import com.date.backend.domain.silence.dto.QuestionCardResponse;
import com.date.backend.domain.silence.repository.QuestionCardRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import com.date.backend.global.exception.code.SilenceErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class QuestionCardService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final QuestionCardRepository questionCardRepository;

	public QuestionCardService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			QuestionCardRepository questionCardRepository
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.questionCardRepository = questionCardRepository;
	}

	public QuestionCardListResponse getRandomQuestions(
			Long userId,
			Long sessionId,
			int limit
	) {
		WaitingRoom session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (!session.isInProgress()) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_IN_PROGRESS);
		}
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_PARTICIPANT);
		}
		return new QuestionCardListResponse(sessionId, selectRandom(limit));
	}

	public List<QuestionCardResponse> selectRandom(int limit) {
		List<QuestionCard> candidates = new ArrayList<>(
				questionCardRepository
						.findAllByActiveTrueAndSensitiveFalseOrderByDisplayOrderAsc()
		);
		if (candidates.isEmpty()) {
			throw new BusinessException(SilenceErrorCode.QUESTION_CARD_NOT_AVAILABLE);
		}
		Collections.shuffle(candidates);
		return candidates.stream()
				.limit(Math.min(limit, candidates.size()))
				.map(QuestionCardResponse::from)
				.toList();
	}
}
