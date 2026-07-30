package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.domain.QuestionRecommendationEvent;
import com.date.backend.domain.silence.domain.QuestionRecommendationStatus;
import com.date.backend.domain.silence.dto.AiQuestionRecommendationRequest;
import com.date.backend.domain.silence.dto.ContextualQuestionRecommendationResponse;
import com.date.backend.domain.silence.dto.QuestionRecommendationReceiptResponse;
import com.date.backend.domain.silence.event.ContextualQuestionDeliveryEvent;
import com.date.backend.domain.silence.repository.QuestionRecommendationEventRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.date.backend.global.exception.code.SilenceErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Service
public class AiQuestionRecommendationService {
	private static final String EVENT_TYPE = "QUESTION_RECOMMENDATION_READY";
	private static final int VERSION = 1;

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final QuestionRecommendationEventRepository recommendationRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public AiQuestionRecommendationService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			QuestionRecommendationEventRepository recommendationRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.recommendationRepository = recommendationRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public QuestionRecommendationReceiptResponse receive(
			AiQuestionRecommendationRequest request
	) {
		validateContract(request);
		if (isDuplicate(request)) {
			return new QuestionRecommendationReceiptResponse(
					request.eventId(),
					"DUPLICATE"
			);
		}
		Long sessionId = parsePositiveId(request.sessionId());
		Long targetUserId = parsePositiveId(request.targetUserId());
		WaitingRoom session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (!session.isInProgress() || session.getActualStartAt() == null) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_SESSION_NOT_ACTIVE);
		}
		participantRepository.findByRoomIdAndUserIdForUpdate(sessionId, targetUserId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (isDuplicate(request)) {
			return new QuestionRecommendationReceiptResponse(
					request.eventId(),
					"DUPLICATE"
			);
		}

		LocalDateTime now = LocalDateTime.now(clock);
		long currentElapsedMs = Math.max(
				0,
				Duration.between(session.getActualStartAt(), now).toMillis()
		);
		QuestionRecommendationStatus status =
				currentElapsedMs > request.expiresAtSessionElapsedMs()
						? QuestionRecommendationStatus.EXPIRED
						: QuestionRecommendationStatus.DELIVERED;
		recommendationRepository.saveAndFlush(new QuestionRecommendationEvent(
				request.eventId(),
				sessionId,
				targetUserId,
				request.deduplicationKey(),
				request.triggeredAtSessionElapsedMs(),
				request.expiresAtSessionElapsedMs(),
				status,
				request.source(),
				request.version(),
				request.contextSummary(),
				request.occurredAt()
						.atZoneSameInstant(ZoneId.systemDefault())
						.toLocalDateTime(),
				now,
				request.questions()
		));
		if (status == QuestionRecommendationStatus.DELIVERED) {
			eventPublisher.publishEvent(new ContextualQuestionDeliveryEvent(
					targetUserId,
					new ContextualQuestionRecommendationResponse(
							ContextualQuestionRecommendationResponse.EVENT_TYPE,
							request.eventId(),
							sessionId,
							request.questions(),
							request.expiresAtSessionElapsedMs()
					)
			));
		}
		return new QuestionRecommendationReceiptResponse(
				request.eventId(),
				status.name()
		);
	}

	private void validateContract(AiQuestionRecommendationRequest request) {
		if (!EVENT_TYPE.equals(request.eventType())
				|| request.version() != VERSION
				|| request.expiresAtSessionElapsedMs()
						< request.triggeredAtSessionElapsedMs()
				|| request.questions() == null
				|| request.questions().size() != 3
				|| request.questions().stream().anyMatch(
						question -> question == null || question.isBlank()
				)) {
			throw new BusinessException(
					SilenceErrorCode.QUESTION_RECOMMENDATION_CONTRACT_INVALID
			);
		}
	}

	private boolean isDuplicate(AiQuestionRecommendationRequest request) {
		return recommendationRepository.existsByEventIdOrDeduplicationKey(
				request.eventId(),
				request.deduplicationKey()
		);
	}

	private Long parsePositiveId(String value) {
		try {
			long parsed = Long.parseLong(value);
			if (parsed <= 0) {
				throw new NumberFormatException();
			}
			return parsed;
		} catch (NumberFormatException exception) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE);
		}
	}
}
