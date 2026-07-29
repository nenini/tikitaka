package com.date.backend.domain.result.application;

import com.date.backend.domain.result.domain.EvaluationItem;
import com.date.backend.domain.result.dto.EvaluationItemResponse;
import com.date.backend.domain.result.dto.EvaluationItemsResponse;
import com.date.backend.domain.result.dto.EvaluationStatusResponse;
import com.date.backend.domain.result.repository.PeerEvaluationRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ResultErrorCode;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

@Service
public class PeerEvaluationService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final PeerEvaluationRepository evaluationRepository;

	public PeerEvaluationService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			PeerEvaluationRepository evaluationRepository
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.evaluationRepository = evaluationRepository;
	}

	@Transactional(readOnly = true)
	public EvaluationItemsResponse getItems(Long userId, Long sessionId) {
		SessionParticipants context = completedSessionParticipants(userId, sessionId);
		List<EvaluationItemResponse> items = Arrays.stream(EvaluationItem.values())
				.map(EvaluationItemResponse::from)
				.toList();
		return new EvaluationItemsResponse(
				sessionId,
				context.partnerUserId(),
				items,
				1000
		);
	}

	@Transactional(readOnly = true)
	public EvaluationStatusResponse getStatus(Long userId, Long sessionId) {
		SessionParticipants context = completedSessionParticipants(userId, sessionId);
		boolean mySubmitted =
				evaluationRepository.existsBySessionIdAndEvaluatorUserId(
						sessionId, userId
				);
		boolean partnerSubmitted =
				evaluationRepository.existsBySessionIdAndEvaluatorUserId(
						sessionId, context.partnerUserId()
				);
		return new EvaluationStatusResponse(
				sessionId,
				mySubmitted,
				partnerSubmitted,
				mySubmitted && partnerSubmitted
		);
	}

	private SessionParticipants completedSessionParticipants(
			Long userId,
			Long sessionId
	) {
		WaitingRoom session = sessionRepository.findWithMatchPairById(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (session.getStatus() != RoomSessionStatus.COMPLETED) {
			throw new BusinessException(
					ResultErrorCode.EVALUATION_SESSION_NOT_COMPLETED
			);
		}
		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		boolean participant = participants.stream()
				.anyMatch(value -> value.getUserId().equals(userId));
		if (!participant) {
			throw new BusinessException(ResultErrorCode.EVALUATION_NOT_PARTICIPANT);
		}
		Long partnerUserId = participants.stream()
				.map(RoomParticipant::getUserId)
				.filter(value -> !value.equals(userId))
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						ResultErrorCode.EVALUATION_NOT_PARTICIPANT
				));
		return new SessionParticipants(session, partnerUserId);
	}

	private record SessionParticipants(WaitingRoom session, Long partnerUserId) {
	}
}
