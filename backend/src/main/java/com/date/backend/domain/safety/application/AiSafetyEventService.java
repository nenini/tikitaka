package com.date.backend.domain.safety.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.safety.domain.SafetyEvent;
import com.date.backend.domain.safety.domain.SafetySeverity;
import com.date.backend.domain.safety.dto.AiSafetyEventRequest;
import com.date.backend.domain.safety.dto.SafetyEventReceiptResponse;
import com.date.backend.domain.safety.dto.SafetyWarningResponse;
import com.date.backend.domain.safety.event.SafetyWarningDeliveryEvent;
import com.date.backend.domain.safety.repository.SafetyEventRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.date.backend.global.exception.code.SafetyErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Service
public class AiSafetyEventService {
	private static final String EVENT_TYPE = "SAFETY_EVENT_DETECTED";
	private static final int VERSION = 1;

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final SafetyEventRepository safetyEventRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public AiSafetyEventService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			SafetyEventRepository safetyEventRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.safetyEventRepository = safetyEventRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public SafetyEventReceiptResponse receive(AiSafetyEventRequest request) {
		validateContract(request);
		if (isDuplicate(request)) {
			return new SafetyEventReceiptResponse(
					request.eventId(),
					"DUPLICATE",
					null,
					0,
					0
			);
		}
		Long sessionId = parsePositiveId(request.sessionId());
		Long userId = parsePositiveId(request.userId());
		WaitingRoom session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (!session.isInProgress()) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_SESSION_NOT_ACTIVE);
		}
		participantRepository.findByRoomIdAndUserIdForUpdate(sessionId, userId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (isDuplicate(request)) {
			return new SafetyEventReceiptResponse(
					request.eventId(),
					"DUPLICATE",
					null,
					0,
					0
			);
		}

		int occurrenceCount = Math.toIntExact(
				safetyEventRepository.countBySessionIdAndUserIdAndCategory(
						sessionId,
						userId,
						request.category()
				) + 1
		);
		SafetySeverity effectiveSeverity = SafetySeverity.effective(
				request.severity(),
				occurrenceCount
		);
		LocalDateTime receivedAt = LocalDateTime.now(clock);
		safetyEventRepository.saveAndFlush(new SafetyEvent(
				request.eventId(),
				sessionId,
				userId,
				request.category(),
				request.severity(),
				effectiveSeverity,
				occurrenceCount,
				request.reasonCode(),
				request.warningMessage(),
				request.confidence(),
				request.deduplicationKey(),
				request.sessionElapsedMs(),
				request.source(),
				request.version(),
				request.occurredAt()
						.atZoneSameInstant(ZoneId.systemDefault())
						.toLocalDateTime(),
				receivedAt
		));
		eventPublisher.publishEvent(new SafetyWarningDeliveryEvent(
				userId,
				new SafetyWarningResponse(
						SafetyWarningResponse.EVENT_TYPE,
						request.eventId(),
						sessionId,
						request.category(),
						effectiveSeverity,
						request.warningMessage().trim(),
						effectiveSeverity == SafetySeverity.HIGH
								? SafetyWarningResponse.REPORT_OR_LEAVE_OPTIONS
								: SafetyWarningResponse.CAUTION,
						occurrenceCount
				)
		));
		return new SafetyEventReceiptResponse(
				request.eventId(),
				"DELIVERED",
				effectiveSeverity,
				occurrenceCount,
				effectiveSeverity.mannerPenaltyScore()
		);
	}

	private void validateContract(AiSafetyEventRequest request) {
		if (!EVENT_TYPE.equals(request.eventType()) || request.version() != VERSION) {
			throw new BusinessException(SafetyErrorCode.SAFETY_EVENT_CONTRACT_INVALID);
		}
	}

	private boolean isDuplicate(AiSafetyEventRequest request) {
		return safetyEventRepository.existsByEventIdOrDeduplicationKey(
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
