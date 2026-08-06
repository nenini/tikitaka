package com.date.backend.domain.moderation.application;

import com.date.backend.domain.growth.event.NoShowConfirmedEvent;
import com.date.backend.domain.moderation.config.NoShowPolicyProperties;
import com.date.backend.domain.moderation.domain.AttendancePenalty;
import com.date.backend.domain.moderation.domain.UserSanction;
import com.date.backend.domain.moderation.dto.response.NoShowResponse;
import com.date.backend.domain.moderation.repository.AttendancePenaltyRepository;
import com.date.backend.domain.moderation.repository.UserSanctionRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class NoShowService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final AttendancePenaltyRepository penaltyRepository;
	private final UserSanctionRepository sanctionRepository;
	private final NoShowPolicyProperties properties;
	private final Clock clock;
	private final ApplicationEventPublisher eventPublisher;

	public NoShowService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			AttendancePenaltyRepository penaltyRepository,
			UserSanctionRepository sanctionRepository,
			NoShowPolicyProperties properties,
			Clock clock,
			ApplicationEventPublisher eventPublisher
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.penaltyRepository = penaltyRepository;
		this.sanctionRepository = sanctionRepository;
		this.properties = properties;
		this.clock = clock;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public NoShowResponse record(Long reporterUserId, Long sessionId) {
		var session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(ModerationErrorCode.NO_SHOW_SESSION_NOT_FOUND));
		var participants = participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		RoomParticipant reporter = participants.stream()
				.filter(item -> item.getUserId().equals(reporterUserId))
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						ModerationErrorCode.NO_SHOW_NOT_SESSION_PARTICIPANT));
		if (!reporter.isJoined()) {
			throw new BusinessException(ModerationErrorCode.NO_SHOW_REPORTER_NOT_JOINED);
		}

		LocalDateTime now = LocalDateTime.now(clock);
		LocalDateTime deadline = session.getScheduledStartAt().plus(properties.gracePeriod());
		if (now.isBefore(deadline)) {
			throw new BusinessException(ModerationErrorCode.NO_SHOW_GRACE_PERIOD_NOT_ELAPSED);
		}

		RoomParticipant absent = participants.stream()
				.filter(item -> !item.getUserId().equals(reporterUserId))
				.filter(item -> !item.isJoined())
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						ModerationErrorCode.NO_SHOW_TARGET_NOT_FOUND));

		var existing = penaltyRepository.findBySessionIdAndUserIdAndPenaltyType(
				sessionId, absent.getUserId(), "NO_SHOW");
		if (existing.isPresent()) {
			return existingResponse(existing.get(), true);
		}
		return createPenalty(sessionId, absent.getUserId(), reporterUserId, now);
	}

	@Transactional
	public int recordAutomatically(Long sessionId) {
		var session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElse(null);
		if (session == null || session.isEnded() || session.isInProgress()) {
			return 0;
		}

		LocalDateTime now = LocalDateTime.now(clock);
		LocalDateTime deadline = session.getScheduledStartAt().plus(properties.gracePeriod());
		if (now.isBefore(deadline)) {
			return 0;
		}

		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		boolean anyoneJoined = participants.stream()
				.anyMatch(participant -> participant.getJoinedAt() != null);
		if (!anyoneJoined) {
			return 0;
		}

		int recorded = 0;
		for (RoomParticipant participant : participants) {
			if (participant.getJoinedAt() != null) {
				continue;
			}
			if (penaltyRepository.findBySessionIdAndUserIdAndPenaltyType(
					sessionId, participant.getUserId(), "NO_SHOW").isPresent()) {
				continue;
			}
			createPenalty(sessionId, participant.getUserId(), null, now);
			recorded++;
		}
		return recorded;
	}

	private NoShowResponse createPenalty(
			Long sessionId,
			Long absentUserId,
			Long recordedByUserId,
			LocalDateTime now
	) {
		AttendancePenalty penalty = penaltyRepository.save(
				new AttendancePenalty(absentUserId, sessionId, now));
		penaltyRepository.flush();
		eventPublisher.publishEvent(new NoShowConfirmedEvent(
				penalty.getId(), sessionId, absentUserId, now));

		long count = penaltyRepository.countByUserIdAndPenaltyType(absentUserId, "NO_SHOW");
		LocalDateTime endsAt = now.plus(properties.restrictionFor((int) count));
		UserSanction sanction = sanctionRepository.save(new UserSanction(
				absentUserId,
				"예약 세션 노쇼 누적 " + count + "회",
				now,
				endsAt,
				recordedByUserId
		));
		return new NoShowResponse(
				sessionId,
				absentUserId,
				count,
				penalty.getCreatedAt(),
				sanction.getStartsAt(),
				sanction.getEndsAt(),
				false
		);
	}

	private NoShowResponse existingResponse(
			AttendancePenalty penalty,
			boolean alreadyRecorded
	) {
		var active = sanctionRepository.findActiveByUserId(
				penalty.getUserId(), LocalDateTime.now(clock));
		var sanction = active.isEmpty() ? null : active.get(0);
		return new NoShowResponse(
				penalty.getSessionId(),
				penalty.getUserId(),
				penaltyRepository.countByUserIdAndPenaltyType(
						penalty.getUserId(), "NO_SHOW"),
				penalty.getCreatedAt(),
				sanction == null ? null : sanction.getStartsAt(),
				sanction == null ? null : sanction.getEndsAt(),
				alreadyRecorded
		);
	}
}
