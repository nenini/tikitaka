package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.config.AiSessionProperties;
import com.date.backend.domain.coach.domain.AiCoachingEvent;
import com.date.backend.domain.coach.domain.CoachingDeliveryStatus;
import com.date.backend.domain.coach.dto.AiCoachingReceiptResponse;
import com.date.backend.domain.coach.dto.AiCoachingRequest;
import com.date.backend.domain.coach.dto.CoachingMessageResponse;
import com.date.backend.domain.coach.event.CoachingMessageDeliveryEvent;
import com.date.backend.domain.coach.repository.AiCoachingEventRepository;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Service
public class AiCoachingService {
	private static final String REQUEST_EVENT_TYPE = "COACHING_REQUESTED";
	private static final int CONTRACT_VERSION = 1;

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final AiCoachingEventRepository coachingEventRepository;
	private final AiSessionProperties properties;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public AiCoachingService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			AiCoachingEventRepository coachingEventRepository,
			AiSessionProperties properties,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.coachingEventRepository = coachingEventRepository;
		this.properties = properties;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public AiCoachingReceiptResponse receive(AiCoachingRequest request) {
		validateContract(request);
		if (isDuplicate(request)) {
			return AiCoachingReceiptResponse.of(request.eventId(), "DUPLICATE");
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
			return AiCoachingReceiptResponse.of(request.eventId(), "DUPLICATE");
		}

		LocalDateTime now = LocalDateTime.now(clock);
		long currentElapsedMs = Math.max(
				0,
				Duration.between(session.getActualStartAt(), now).toMillis()
		);
		CoachingDeliveryStatus deliveryStatus = resolveDeliveryStatus(
				sessionId,
				targetUserId,
				request,
				currentElapsedMs,
				now
		);
		AiCoachingEvent coachingEvent = new AiCoachingEvent(
				request.eventId(),
				sessionId,
				targetUserId,
				request.eventType(),
				request.version(),
				request.source(),
				request.coachingType(),
				request.messageKey(),
				request.messageText(),
				request.priority(),
				request.reasonCode(),
				request.triggeredAtSessionElapsedMs(),
				request.expiresAtSessionElapsedMs(),
				request.deduplicationKey(),
				deliveryStatus,
				request.occurredAt()
						.atZoneSameInstant(ZoneId.systemDefault())
						.toLocalDateTime(),
				now
		);
		coachingEventRepository.saveAndFlush(coachingEvent);
		if (deliveryStatus == CoachingDeliveryStatus.DELIVERED) {
			eventPublisher.publishEvent(new CoachingMessageDeliveryEvent(
					targetUserId,
					new CoachingMessageResponse(
							CoachingMessageResponse.EVENT_TYPE,
							request.eventId(),
							sessionId,
							request.coachingType(),
							request.messageKey(),
							trimToNull(request.messageText()),
							request.priority(),
							request.reasonCode(),
							request.triggeredAtSessionElapsedMs(),
							request.expiresAtSessionElapsedMs()
					)
			));
		}
		return AiCoachingReceiptResponse.of(
				request.eventId(),
				deliveryStatus.name()
		);
	}

	private CoachingDeliveryStatus resolveDeliveryStatus(
			Long sessionId,
			Long targetUserId,
			AiCoachingRequest request,
			long currentElapsedMs,
			LocalDateTime now
	) {
		if (currentElapsedMs > request.expiresAtSessionElapsedMs()) {
			return CoachingDeliveryStatus.EXPIRED;
		}
		LocalDateTime exposureCutoff = now.minus(properties.coachingMinInterval());
		boolean recentlyDelivered = coachingEventRepository
				.existsBySessionIdAndTargetUserIdAndCoachingTypeAndDeliveryStatusAndDeliveredAtGreaterThanEqual(
						sessionId,
						targetUserId,
						request.coachingType(),
						CoachingDeliveryStatus.DELIVERED,
						exposureCutoff
				);
		return recentlyDelivered
				? CoachingDeliveryStatus.SUPPRESSED
				: CoachingDeliveryStatus.DELIVERED;
	}

	private void validateContract(AiCoachingRequest request) {
		if (!REQUEST_EVENT_TYPE.equals(request.eventType())
				|| request.version() != CONTRACT_VERSION
				|| request.expiresAtSessionElapsedMs()
						< request.triggeredAtSessionElapsedMs()) {
			throw new BusinessException(CoachErrorCode.AI_COACHING_CONTRACT_INVALID);
		}
	}

	private boolean isDuplicate(AiCoachingRequest request) {
		return coachingEventRepository.existsByEventIdOrDeduplicationKey(
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

	private String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
