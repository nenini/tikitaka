package com.date.backend.domain.room.application;

import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.domain.room.dto.response.SessionParticipantResponse;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class SessionQueryService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final ProfileRepository profileRepository;
	private final Clock clock;

	public SessionQueryService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			ProfileRepository profileRepository,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.profileRepository = profileRepository;
		this.clock = clock;
	}

	public SessionDetailResponse getDetail(Long userId, Long sessionId) {
		WaitingRoom session = sessionRepository.findWithMatchPairById(sessionId)
				.orElseThrow(() -> new BusinessException(
						SessionErrorCode.SESSION_NOT_FOUND
				));
		var participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		if (participants.stream().noneMatch(
				participant -> participant.getUserId().equals(userId)
		)) {
			throw new BusinessException(SessionErrorCode.SESSION_NOT_PARTICIPANT);
		}

		Map<Long, Profile> profiles = profileRepository.findAllById(
						participants.stream().map(RoomParticipant::getUserId).toList()
				).stream()
				.collect(Collectors.toMap(Profile::getUserId, Function.identity()));

		return new SessionDetailResponse(
				session.getId(),
				session.getMatchPair().getId(),
				session.getStatus(),
				session.getScheduledStartAt(),
				session.getActualStartAt(),
				session.getActualEndAt(),
				session.getPlannedDurationSec(),
				remainingSeconds(session, LocalDateTime.now(clock)),
				participants.stream()
						.map(participant -> new SessionParticipantResponse(
								participant.getUserId(),
								profiles.containsKey(participant.getUserId())
										? profiles.get(participant.getUserId()).getNickname()
										: null,
								participant.getParticipantRole(),
								participant.getParticipationStatus()
						))
						.toList()
		);
	}

	private long remainingSeconds(WaitingRoom session, LocalDateTime now) {
		if (session.getStatus() == RoomSessionStatus.COMPLETED
				|| session.getStatus() == RoomSessionStatus.CANCELLED) {
			return 0;
		}
		LocalDateTime deadline = session.getScheduledStartAt();
		if (session.getStatus() == RoomSessionStatus.IN_PROGRESS
				&& session.getActualStartAt() != null) {
			deadline = session.getActualStartAt().plusSeconds(
					(long) session.getPlannedDurationSec()
							+ session.getExtensionDurationSec()
			);
		}
		return Math.max(0, Duration.between(now, deadline).getSeconds());
	}
}
