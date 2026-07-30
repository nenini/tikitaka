package com.date.backend.domain.silence.application;

import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.silence.domain.SilenceEvent;
import com.date.backend.domain.silence.domain.SilenceInterventionStage;
import com.date.backend.domain.silence.dto.AiSilenceEventRequest;
import com.date.backend.domain.silence.dto.QuestionCardResponse;
import com.date.backend.domain.silence.dto.SilenceEventReceiptResponse;
import com.date.backend.domain.silence.dto.SilenceInterventionResponse;
import com.date.backend.domain.silence.event.SilenceInterventionEvent;
import com.date.backend.domain.silence.repository.SilenceEventRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CoachErrorCode;
import com.date.backend.global.exception.code.SilenceErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Service
public class AiSilenceEventService {
	private static final String EVENT_TYPE = "SILENCE_ANALYZED";
	private static final int VERSION = 1;

	private final WaitingRoomRepository sessionRepository;
	private final SilenceEventRepository silenceEventRepository;
	private final QuestionCardService questionCardService;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public AiSilenceEventService(
			WaitingRoomRepository sessionRepository,
			SilenceEventRepository silenceEventRepository,
			QuestionCardService questionCardService,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.silenceEventRepository = silenceEventRepository;
		this.questionCardService = questionCardService;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public SilenceEventReceiptResponse receive(AiSilenceEventRequest request) {
		validateContract(request);
		if (silenceEventRepository.existsById(request.eventId())) {
			return new SilenceEventReceiptResponse(request.eventId(), "DUPLICATE", null);
		}
		Long sessionId = parsePositiveId(request.sessionId());
		WaitingRoom session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						CoachErrorCode.AI_ANALYSIS_INVALID_REFERENCE
				));
		if (!session.isInProgress()) {
			throw new BusinessException(CoachErrorCode.AI_ANALYSIS_SESSION_NOT_ACTIVE);
		}
		SilenceInterventionStage stage =
				SilenceInterventionStage.fromDuration(request.silenceDurationMs());
		if (silenceEventRepository
				.existsBySessionIdAndSilenceStartedElapsedMsAndInterventionStage(
						sessionId,
						request.silenceStartedAtSessionElapsedMs(),
						stage
				)) {
			return new SilenceEventReceiptResponse(
					request.eventId(),
					"SUPPRESSED",
					stage
			);
		}
		LocalDateTime receivedAt = LocalDateTime.now(clock);
		silenceEventRepository.saveAndFlush(new SilenceEvent(
				request.eventId(),
				sessionId,
				request.silenceStartedAtSessionElapsedMs(),
				request.detectedAtSessionElapsedMs(),
				request.silenceDurationMs(),
				stage,
				request.source(),
				request.version(),
				request.occurredAt()
						.atZoneSameInstant(ZoneId.systemDefault())
						.toLocalDateTime(),
				receivedAt
		));
		if (stage != SilenceInterventionStage.NONE) {
			List<QuestionCardResponse> questions =
					stage == SilenceInterventionStage.QUESTION_CARD
							? questionCardService.selectRandom(3)
							: List.of();
			eventPublisher.publishEvent(new SilenceInterventionEvent(
					new SilenceInterventionResponse(
							SilenceInterventionResponse.EVENT_TYPE,
							request.eventId(),
							sessionId,
							request.silenceDurationMs(),
							stage,
							questions
					)
			));
		}
		return new SilenceEventReceiptResponse(request.eventId(), "PROCESSED", stage);
	}

	private void validateContract(AiSilenceEventRequest request) {
		long calculatedDuration = request.detectedAtSessionElapsedMs()
				- request.silenceStartedAtSessionElapsedMs();
		if (!EVENT_TYPE.equals(request.eventType())
				|| request.version() != VERSION
				|| calculatedDuration < 0
				|| Math.abs(calculatedDuration - request.silenceDurationMs()) > 1_000) {
			throw new BusinessException(
					SilenceErrorCode.SILENCE_EVENT_CONTRACT_INVALID
			);
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
}
