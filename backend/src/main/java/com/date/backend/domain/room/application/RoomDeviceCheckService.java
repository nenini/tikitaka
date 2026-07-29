package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.room.domain.RoomDeviceCheck;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.request.RoomDeviceCheckRequest;
import com.date.backend.domain.room.dto.response.RoomDeviceCheckResponse;
import com.date.backend.domain.room.repository.RoomDeviceCheckRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.RoomErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@Transactional(readOnly = true)
public class RoomDeviceCheckService {
	private final WaitingRoomRepository roomRepository;
	private final RoomParticipantRepository participantRepository;
	private final RoomDeviceCheckRepository deviceCheckRepository;
	private final Clock clock;

	public RoomDeviceCheckService(
			WaitingRoomRepository roomRepository,
			RoomParticipantRepository participantRepository,
			RoomDeviceCheckRepository deviceCheckRepository,
			Clock clock
	) {
		this.roomRepository = roomRepository;
		this.participantRepository = participantRepository;
		this.deviceCheckRepository = deviceCheckRepository;
		this.clock = clock;
	}

	@Transactional
	public RoomDeviceCheckResponse save(
			Long userId,
			Long roomId,
			RoomDeviceCheckRequest request
	) {
		WaitingRoom room = findAccessibleRoom(userId, roomId);
		validateCheckable(room);
		RoomDeviceCheck check = deviceCheckRepository.saveAndFlush(new RoomDeviceCheck(
				room,
				userId,
				request.cameraPassed(),
				request.microphonePassed(),
				request.speakerPassed(),
				request.networkPassed(),
				LocalDateTime.now(clock)
		));
		return RoomDeviceCheckResponse.from(roomId, check);
	}

	public RoomDeviceCheckResponse getLatest(Long userId, Long roomId) {
		findAccessibleRoom(userId, roomId);
		RoomDeviceCheck check = deviceCheckRepository
				.findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(roomId, userId)
				.orElseThrow(() -> new BusinessException(
						RoomErrorCode.DEVICE_CHECK_NOT_FOUND
				));
		return RoomDeviceCheckResponse.from(roomId, check);
	}

	private WaitingRoom findAccessibleRoom(Long userId, Long roomId) {
		WaitingRoom room = roomRepository.findWithMatchPairById(roomId)
				.orElseThrow(() -> new BusinessException(RoomErrorCode.ROOM_NOT_FOUND));
		if (!participantRepository.existsByRoom_IdAndUserId(roomId, userId)) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}
		return room;
	}

	private void validateCheckable(WaitingRoom room) {
		if (room.getMatchPair().getStatus() == MatchStatus.CANCELLED
				|| room.getStatus() == RoomSessionStatus.CANCELLED
				|| room.getStatus() == RoomSessionStatus.COMPLETED) {
			throw new BusinessException(RoomErrorCode.DEVICE_CHECK_NOT_ALLOWED);
		}
	}
}
