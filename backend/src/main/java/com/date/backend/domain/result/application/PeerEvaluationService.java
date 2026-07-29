package com.date.backend.domain.result.application;

import com.date.backend.domain.result.domain.EvaluationItem;
import com.date.backend.domain.result.dto.EvaluationItemResponse;
import com.date.backend.domain.result.dto.EvaluationItemsResponse;
import com.date.backend.domain.result.dto.EvaluationStatusResponse;
import com.date.backend.domain.result.dto.PeerEvaluationResultResponse;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitResponse;
import com.date.backend.domain.result.domain.PeerEvaluation;
import com.date.backend.domain.result.event.PeerEvaluationsCompletedEvent;
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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Service
public class PeerEvaluationService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final PeerEvaluationRepository evaluationRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public PeerEvaluationService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			PeerEvaluationRepository evaluationRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.evaluationRepository = evaluationRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
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

	@Transactional
	public PeerEvaluationSubmitResponse submit(
			Long userId,
			Long sessionId,
			PeerEvaluationSubmitRequest request
	) {
		SessionParticipants context =
				completedSessionParticipantsForUpdate(userId, sessionId);
		if (evaluationRepository.existsBySessionIdAndEvaluatorUserId(
				sessionId, userId
		)) {
			throw new BusinessException(ResultErrorCode.EVALUATION_ALREADY_SUBMITTED);
		}
		LocalDateTime now = LocalDateTime.now(clock);
		PeerEvaluation evaluation = new PeerEvaluation(
				sessionId,
				userId,
				context.partnerUserId(),
				request.comfortScore(),
				request.questionConnectionScore(),
				request.listeningScore(),
				request.reactionScore(),
				request.balanceScore(),
				request.mannerScore(),
				request.goodBehaviorText(),
				request.improvementText(),
				now
		);
		try {
			evaluationRepository.saveAndFlush(evaluation);
		} catch (DataIntegrityViolationException exception) {
			throw new BusinessException(
					ResultErrorCode.EVALUATION_ALREADY_SUBMITTED
			);
		}

		boolean allSubmitted = evaluationRepository.countBySessionId(sessionId) >= 2;
		boolean reportRequested = false;
		if (allSubmitted && context.session().claimEvaluationCompletion(now)) {
			reportRequested = true;
			eventPublisher.publishEvent(
					new PeerEvaluationsCompletedEvent(sessionId, now)
			);
		}
		return new PeerEvaluationSubmitResponse(
				evaluation.getId(),
				sessionId,
				"SUBMITTED",
				allSubmitted,
				reportRequested,
				now
		);
	}

	@Transactional(readOnly = true)
	public PeerEvaluationResultResponse getResult(Long userId, Long sessionId) {
		completedSessionParticipants(userId, sessionId);
		if (evaluationRepository.countBySessionId(sessionId) < 2) {
			throw new BusinessException(ResultErrorCode.EVALUATION_NOT_COMPLETED);
		}
		PeerEvaluation received = evaluationRepository
				.findBySessionIdAndEvaluateeUserId(sessionId, userId)
				.orElseThrow(() -> new BusinessException(
						ResultErrorCode.EVALUATION_NOT_FOUND
				));
		return PeerEvaluationResultResponse.from(received);
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

	private SessionParticipants completedSessionParticipantsForUpdate(
			Long userId,
			Long sessionId
	) {
		WaitingRoom session = sessionRepository
				.findWithMatchPairByIdForUpdate(sessionId)
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
		Long partnerUserId = participants.stream()
				.map(RoomParticipant::getUserId)
				.filter(value -> !value.equals(userId))
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						ResultErrorCode.EVALUATION_NOT_PARTICIPANT
				));
		boolean participant = participants.stream()
				.anyMatch(value -> value.getUserId().equals(userId));
		if (!participant) {
			throw new BusinessException(ResultErrorCode.EVALUATION_NOT_PARTICIPANT);
		}
		return new SessionParticipants(session, partnerUserId);
	}

	private record SessionParticipants(WaitingRoom session, Long partnerUserId) {
	}
}
