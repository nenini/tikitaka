package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.room.domain.RoomDeviceCheck;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.response.RoomParticipantReadyStatusResponse;
import com.date.backend.domain.room.dto.response.RoomParticipantStatusChangedResponse;
import com.date.backend.domain.room.dto.response.RoomParticipantsStatusResponse;
import com.date.backend.domain.room.event.RoomParticipantStatusChangedEvent;
import com.date.backend.domain.room.repository.RoomDeviceCheckRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class RoomReadyService {
	private static final String READY_CHANGED = "PARTICIPANT_READY_CHANGED";

	private final WaitingRoomRepository roomRepository;
	private final RoomParticipantRepository participantRepository;
	private final RoomDeviceCheckRepository deviceCheckRepository;
	private final ProfileRepository profileRepository;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public RoomReadyService(
			WaitingRoomRepository roomRepository,
			RoomParticipantRepository participantRepository,
			RoomDeviceCheckRepository deviceCheckRepository,
			ProfileRepository profileRepository,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.roomRepository = roomRepository;
		this.participantRepository = participantRepository;
		this.deviceCheckRepository = deviceCheckRepository;
		this.profileRepository = profileRepository;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public RoomParticipantsStatusResponse markReady(Long userId, Long roomId) {
		WaitingRoom room = findRoomForUpdate(roomId);
		validateChangeable(room);
		RoomParticipant participant = findParticipantForUpdate(userId, roomId);
		RoomDeviceCheck latestCheck = deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(roomId, userId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.DEVICE_CHECK_REQUIRED));
		if (!latestCheck.isReadyAvailable()) {
			throw new BusinessException(RoomErrorCode.DEVICE_CHECK_FAILED);
		}

		boolean changed = participant.markReady();
		RoomParticipantsStatusResponse status = createStatus(roomId);
		if (status.allReady()) {
			room.markReady();
		} else if (room.getStatus() == RoomSessionStatus.READY) {
			room.markWaiting();
		}
		if (changed) {
			publishChange(userId, true, status);
		}
		return status;
	}

	@Transactional
	public RoomParticipantsStatusResponse cancelReady(Long userId, Long roomId) {
		WaitingRoom room = findRoomForUpdate(roomId);
		validateChangeable(room);
		RoomParticipant participant = findParticipantForUpdate(userId, roomId);

		boolean changed = participant.cancelReady();
		RoomParticipantsStatusResponse status = createStatus(roomId);
		if (room.getStatus() == RoomSessionStatus.READY) {
			room.markWaiting();
		}
		if (changed) {
			publishChange(userId, false, status);
		}
		return status;
	}

	public RoomParticipantsStatusResponse getStatus(Long userId, Long roomId) {
		findRoom(roomId);
		if (!participantRepository.existsByRoom_IdAndUserId(roomId, userId)) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}
		return createStatus(roomId);
	}

	private WaitingRoom findRoom(Long roomId) {
		return roomRepository.findWithMatchPairById(roomId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.ROOM_NOT_FOUND));
	}

	private WaitingRoom findRoomForUpdate(Long roomId) {
		return roomRepository.findWithMatchPairByIdForUpdate(roomId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.ROOM_NOT_FOUND));
	}

	private RoomParticipant findParticipantForUpdate(Long userId, Long roomId) {
		return participantRepository.findByRoomIdAndUserIdForUpdate(roomId, userId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT));
	}

	private void validateChangeable(WaitingRoom room) {
		if (room.getMatchPair().getStatus() == MatchStatus.CANCELLED
				|| room.getStatus() == RoomSessionStatus.CANCELLED
				|| room.getStatus() == RoomSessionStatus.COMPLETED
				|| room.getStatus() == RoomSessionStatus.IN_PROGRESS) {
			throw new BusinessException(RoomErrorCode.ROOM_READY_NOT_ALLOWED);
		}
	}

	private RoomParticipantsStatusResponse createStatus(Long roomId) {
		var participants = participantRepository.findAllByRoom_IdOrderByUserIdAsc(roomId);
		Map<Long, Profile> profiles = profileRepository.findAllById(
						participants.stream().map(RoomParticipant::getUserId).toList()
				).stream()
				.collect(Collectors.toMap(Profile::getUserId, Function.identity()));
		var participantStatuses = participants.stream()
				.map(participant -> new RoomParticipantReadyStatusResponse(
						participant.getUserId(),
						profiles.containsKey(participant.getUserId())
								? profiles.get(participant.getUserId()).getNickname()
								: null,
						participant.isReady()
				))
				.toList();
		boolean allReady = !participantStatuses.isEmpty()
				&& participantStatuses.stream().allMatch(
						RoomParticipantReadyStatusResponse::ready
				);
		return new RoomParticipantsStatusResponse(roomId, allReady, participantStatuses);
	}

	private void publishChange(
			Long changedUserId,
			boolean ready,
			RoomParticipantsStatusResponse status
	) {
		eventPublisher.publishEvent(new RoomParticipantStatusChangedEvent(
				new RoomParticipantStatusChangedResponse(
						READY_CHANGED,
						status.roomId(),
						changedUserId,
						ready,
						status.allReady(),
						status.participants(),
						LocalDateTime.now(clock)
				)
		));
	}
}
