package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.domain.AiAnalysisType;
import com.date.backend.domain.coach.domain.AiSessionAnalysisEvent;
import com.date.backend.domain.coach.dto.AiAnalysisEventRequest;
import com.date.backend.domain.coach.dto.AiAnalysisEventResponse;
import com.date.backend.domain.coach.repository.AiSessionAnalysisEventRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.Duration;
import java.time.ZoneId;

@Service
public class AiAnalysisEventService {
	private static final Duration FINAL_VISION_EVENT_GRACE_PERIOD = Duration.ofSeconds(15);
	private final WaitingRoomRepository waitingRoomRepository;
	private final RoomParticipantRepository participantRepository;
	private final AiSessionAnalysisEventRepository eventRepository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	public AiAnalysisEventService(
			WaitingRoomRepository waitingRoomRepository,
			RoomParticipantRepository participantRepository,
			AiSessionAnalysisEventRepository eventRepository,
			ObjectMapper objectMapper,
			Clock clock
	) {
		this.waitingRoomRepository = waitingRoomRepository;
		this.participantRepository = participantRepository;
		this.eventRepository = eventRepository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Transactional
	public AiAnalysisEventResponse receive(
			AiAnalysisType analysisType,
			AiAnalysisEventRequest request
	) {
		if (eventRepository.existsById(request.eventId())) {
			return AiAnalysisEventResponse.duplicate(request.eventId());
		}

		Long sessionId = parsePositiveId(request.sessionId());
		Long userId = parsePositiveId(request.userId());
		WaitingRoom session = waitingRoomRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (!acceptsEvent(session, analysisType, request)) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_SESSION_NOT_ACTIVE);
		}

		RoomParticipant participant = participantRepository
				.findByRoomIdAndUserIdForUpdate(sessionId, userId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (eventRepository.existsById(request.eventId())) {
			return AiAnalysisEventResponse.duplicate(request.eventId());
		}
		validateParticipant(analysisType, participant, request.participantIdentity());

		AiSessionAnalysisEvent event = new AiSessionAnalysisEvent(
				request.eventId(),
				sessionId,
				userId,
				analysisType,
				request.eventType(),
				request.source(),
				request.version(),
				trimToNull(request.participantIdentity()),
				trimToNull(request.clientInstanceId()),
				request.seq(),
				request.sessionElapsedMs(),
				request.confidence(),
				request.occurredAt()
						.atZoneSameInstant(ZoneId.systemDefault())
						.toLocalDateTime(),
				trimToNull(request.modelVersion()),
				trimToNull(request.ruleVersion()),
				serializePayload(request),
				LocalDateTime.now(clock)
		);
		eventRepository.saveAndFlush(event);
		return AiAnalysisEventResponse.stored(request.eventId());
	}

	private boolean acceptsEvent(
			WaitingRoom session,
			AiAnalysisType analysisType,
			AiAnalysisEventRequest request
	) {
		if (session.isInProgress()) {
			return true;
		}
		if (analysisType != AiAnalysisType.VISION
				|| !session.isEnded()
				|| session.getActualEndAt() == null) {
			return false;
		}
		LocalDateTime deadline = session.getActualEndAt().plus(FINAL_VISION_EVENT_GRACE_PERIOD);
		LocalDateTime receivedAt = LocalDateTime.now(clock);
		LocalDateTime occurredAt = request.occurredAt()
				.atZoneSameInstant(clock.getZone())
				.toLocalDateTime();
		return !receivedAt.isAfter(deadline) && !occurredAt.isAfter(deadline);
	}

	private void validateParticipant(
			AiAnalysisType analysisType,
			RoomParticipant participant,
			String participantIdentity
	) {
		if (participantIdentity != null && !participantIdentity.isBlank()
				&& !participant.getParticipantIdentity().equals(participantIdentity.trim())) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE);
		}
		boolean enabled = analysisType == AiAnalysisType.VOICE
				? participant.isVoiceAnalysisEnabled()
				: participant.isExpressionAnalysisEnabled();
		if (!enabled) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_CONSENT_REQUIRED);
		}
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

	private String serializePayload(AiAnalysisEventRequest request) {
		try {
			return objectMapper.writeValueAsString(request.payload());
		} catch (JsonProcessingException exception) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_PAYLOAD_INVALID);
		}
	}

	private String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
