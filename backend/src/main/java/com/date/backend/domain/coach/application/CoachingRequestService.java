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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 사용자가 코칭 버튼으로 요청한 질문 추천.
 *
 * <p>자동 코칭과 달리 쿨다운을 두지 않는다. 언제 도움이 필요한지는 사용자가 이미
 * 결정한 것이고, 연타는 화면이 요청 중 버튼을 잠가 막는다.
 */
@Service
@Transactional(readOnly = true)
public class CoachingRequestService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final AiSessionEventClient aiSessionEventClient;

	public CoachingRequestService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			AiSessionEventClient aiSessionEventClient
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.aiSessionEventClient = aiSessionEventClient;
	}

	public CoachingRequestAcceptedResponse request(Long userId, Long sessionId) {
		WaitingRoom session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_PARTICIPANT);
		}
		if (!session.isInProgress()) {
			throw new BusinessException(
					CoachErrorCode.COACHING_REQUEST_SESSION_NOT_ACTIVE
			);
		}

		String requestId = UUID.randomUUID().toString();
		QuestionSuggestionResult result = aiSessionEventClient
				.requestQuestionSuggestion(sessionId, userId, requestId);
		return switch (result) {
			case CREATED -> new CoachingRequestAcceptedResponse(requestId);
			case SESSION_NOT_ACTIVE -> throw new BusinessException(
					CoachErrorCode.COACHING_REQUEST_SESSION_NOT_ACTIVE
			);
			// NOT_CONFIGURED 도 사용자에겐 같은 실패다 — 화면은 "지금은 추천을 만들지
			// 못했어요"만 보여주면 되고, 설정 여부는 서버 사정이다.
			case UNAVAILABLE, NOT_CONFIGURED -> throw new BusinessException(
					CoachErrorCode.COACHING_REQUEST_UNAVAILABLE
			);
		};
	}
}
