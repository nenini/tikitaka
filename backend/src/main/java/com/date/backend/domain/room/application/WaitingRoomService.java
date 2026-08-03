package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.moderation.application.UserRestrictionPolicy;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.config.RoomEntryProperties;
import com.date.backend.domain.room.domain.RoomEntryStatus;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.response.RoomParticipantSummaryResponse;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class WaitingRoomService {
	private final WaitingRoomRepository roomRepository;
	private final RoomParticipantRepository participantRepository;
	private final ProfileRepository profileRepository;
	private final RoomEntryProperties entryProperties;
	private final Clock clock;
	private final UserRestrictionPolicy restrictionPolicy;

	public WaitingRoomService(
			WaitingRoomRepository roomRepository,
			RoomParticipantRepository participantRepository,
			ProfileRepository profileRepository,
			RoomEntryProperties entryProperties,
			Clock clock,
			UserRestrictionPolicy restrictionPolicy
	) {
		this.roomRepository = roomRepository;
		this.participantRepository = participantRepository;
		this.profileRepository = profileRepository;
		this.entryProperties = entryProperties;
		this.clock = clock;
		this.restrictionPolicy = restrictionPolicy;
	}

	public WaitingRoomDetailResponse getDetail(Long userId, Long roomId) {
		restrictionPolicy.assertNotRestricted(userId);
		WaitingRoom room = roomRepository.findWithMatchPairById(roomId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.ROOM_NOT_FOUND));
		var participants = participantRepository.findAllByRoom_IdOrderByUserIdAsc(roomId);
		if (participants.stream().noneMatch(participant -> participant.getUserId().equals(userId))) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}

		Map<Long, Profile> profiles = profileRepository.findAllById(
						participants.stream().map(RoomParticipant::getUserId).toList()
				)
				.stream()
				.collect(Collectors.toMap(Profile::getUserId, Function.identity()));

		LocalDateTime enterableFrom =
				room.getScheduledStartAt().minus(entryProperties.entryOpenBefore());
		LocalDateTime enterableUntil =
				room.getScheduledStartAt().plus(entryProperties.entryCloseAfter());
		RoomEntryStatus entryStatus = entryStatus(
				room,
				LocalDateTime.now(clock),
				enterableFrom,
				enterableUntil
		);

		return new WaitingRoomDetailResponse(
				room.getId(),
				room.getMatchPair().getId(),
				effectiveStatus(room),
				room.getScheduledStartAt(),
				enterableFrom,
				enterableUntil,
				entryStatus == RoomEntryStatus.AVAILABLE,
				entryStatus,
				participants.stream()
						.map(participant -> new RoomParticipantSummaryResponse(
								participant.getUserId(),
								profiles.containsKey(participant.getUserId())
										? profiles.get(participant.getUserId()).getNickname()
										: null,
								participant.getParticipationStatus()
						))
						.toList()
		);
	}

	private RoomEntryStatus entryStatus(
			WaitingRoom room,
			LocalDateTime now,
			LocalDateTime enterableFrom,
			LocalDateTime enterableUntil
	) {
		if (room.getMatchPair().getStatus() == MatchStatus.CANCELLED
				|| room.getStatus() == RoomSessionStatus.CANCELLED) {
			return RoomEntryStatus.ROOM_CANCELLED;
		}
		if (room.getStatus() == RoomSessionStatus.COMPLETED) {
			return RoomEntryStatus.ROOM_COMPLETED;
		}
		if (room.getStatus() == RoomSessionStatus.IN_PROGRESS) {
			return RoomEntryStatus.ROOM_IN_PROGRESS;
		}
		if (now.isBefore(enterableFrom)) {
			return RoomEntryStatus.TOO_EARLY;
		}
		if (now.isAfter(enterableUntil)) {
			return RoomEntryStatus.TOO_LATE;
		}
		return RoomEntryStatus.AVAILABLE;
	}

	private RoomSessionStatus effectiveStatus(WaitingRoom room) {
		if (room.getMatchPair().getStatus() == MatchStatus.CANCELLED) {
			return RoomSessionStatus.CANCELLED;
		}
		return room.getStatus();
	}
}
