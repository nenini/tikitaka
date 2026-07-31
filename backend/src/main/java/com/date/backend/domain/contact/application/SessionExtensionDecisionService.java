package com.date.backend.domain.contact.application;

import com.date.backend.domain.contact.domain.ContactDecision;
import com.date.backend.domain.contact.domain.ContactDecisionStatus;
import com.date.backend.domain.contact.domain.ContactExchangeRequest;
import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;
import com.date.backend.domain.contact.event.SessionExtensionDecisionChangedEvent;
import com.date.backend.domain.contact.repository.ContactExchangeRequestRepository;
import com.date.backend.domain.room.application.SessionTerminationService;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SessionExtensionDecisionService {
	private static final long DECISION_WINDOW_MINUTES = 5;

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final ContactExchangeRequestRepository decisionRepository;
	private final SessionTerminationService terminationService;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionExtensionDecisionService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			ContactExchangeRequestRepository decisionRepository,
			SessionTerminationService terminationService,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.decisionRepository = decisionRepository;
		this.terminationService = terminationService;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public SessionExtensionDecisionResponse decide(
			Long userId,
			Long sessionId,
			ContactDecision decision
	) {
		LocalDateTime now = LocalDateTime.now(clock).withNano(0);
		WaitingRoom session = sessionRepository
				.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		if (!session.isInProgress()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_STATE_CONFLICT
			);
		}

		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(
						sessionId
				);
		assertParticipant(userId, participants);
		if (participants.size() != 2) {
			throw new BusinessException(
					SessionErrorCode.SESSION_STATE_CONFLICT
			);
		}

		LocalDateTime scheduledEndAt = session.expectedEndAt();
		assertDecisionWindow(now, scheduledEndAt);

		ContactExchangeRequest stored =
				decisionRepository.findBySession_Id(sessionId).orElse(null);
		boolean changed;
		if (stored == null) {
			stored = new ContactExchangeRequest(
					session,
					userId,
					partnerUserId(userId, participants),
					decision,
					now
			);
			decisionRepository.save(stored);
			changed = true;
		} else {
			changed = stored.recordDecision(userId, decision, now);
		}

		if (changed && stored.getStatus() == ContactDecisionStatus.DECLINED) {
			terminationService.terminateForContactDecline(
					sessionId,
					userId,
					now
			);
		}

		SessionExtensionDecisionResponse response = responseOf(
				stored,
				session,
				scheduledEndAt,
				now
		);
		if (changed) {
			eventPublisher.publishEvent(
					new SessionExtensionDecisionChangedEvent(response)
			);
		}
		return response;
	}

	private void assertDecisionWindow(
			LocalDateTime now,
			LocalDateTime scheduledEndAt
	) {
		if (now.isBefore(
				scheduledEndAt.minusMinutes(DECISION_WINDOW_MINUTES)
		)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_EXTENSION_WINDOW_NOT_OPEN
			);
		}
		if (!now.isBefore(scheduledEndAt)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_STATE_CONFLICT
			);
		}
	}

	private void assertParticipant(
			Long userId,
			List<RoomParticipant> participants
	) {
		if (participants.stream().noneMatch(
				participant -> participant.getUserId().equals(userId)
		)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_NOT_PARTICIPANT
			);
		}
	}

	private Long partnerUserId(
			Long userId,
			List<RoomParticipant> participants
	) {
		return participants.stream()
				.map(RoomParticipant::getUserId)
				.filter(participantId -> !participantId.equals(userId))
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_STATE_CONFLICT
				));
	}

	private SessionExtensionDecisionResponse responseOf(
			ContactExchangeRequest stored,
			WaitingRoom session,
			LocalDateTime scheduledEndAt,
			LocalDateTime occurredAt
	) {
		return new SessionExtensionDecisionResponse(
				SessionExtensionDecisionResponse.EVENT_TYPE,
				session.getId(),
				stored.getStatus(),
				stored.getRequesterUserId(),
				stored.requesterDecision(),
				stored.getTargetUserId(),
				stored.targetDecision(),
				session.getStatus(),
				scheduledEndAt,
				session.getActualEndAt(),
				occurredAt
		);
	}
}
