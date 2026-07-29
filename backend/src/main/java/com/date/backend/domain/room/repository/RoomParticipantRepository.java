package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.time.LocalDateTime;
import java.util.Optional;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {
	List<RoomParticipant> findAllByRoom_IdOrderByUserIdAsc(Long roomId);

	boolean existsByRoom_IdAndUserId(Long roomId, Long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select participant
			from RoomParticipant participant
			where participant.room.id = :roomId
			  and participant.userId = :userId
			""")
	Optional<RoomParticipant> findByRoomIdAndUserIdForUpdate(
			@Param("roomId") Long roomId,
			@Param("userId") Long userId
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select participant
			from RoomParticipant participant
			join fetch participant.room room
			where room.livekitRoomName = :roomName
			  and participant.userId = :userId
			""")
	Optional<RoomParticipant> findByLiveKitRoomNameAndUserIdForUpdate(
			@Param("roomName") String roomName,
			@Param("userId") Long userId
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select participant
			from RoomParticipant participant
			join fetch participant.room room
			where room.status = com.date.backend.domain.room.domain.RoomSessionStatus.IN_PROGRESS
			  and participant.connectionStatus = :connectionStatus
			  and participant.lastHeartbeatAt is not null
			  and participant.lastHeartbeatAt <= :heartbeatCutoff
			order by participant.lastHeartbeatAt asc
			""")
	List<RoomParticipant> findHeartbeatTimedOutForUpdate(
			@Param("connectionStatus")
			SessionConnectionStatus connectionStatus,
			@Param("heartbeatCutoff")
			LocalDateTime heartbeatCutoff,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select participant
			from RoomParticipant participant
			join fetch participant.room room
			where room.status = com.date.backend.domain.room.domain.RoomSessionStatus.IN_PROGRESS
			  and participant.connectionStatus = :connectionStatus
			  and participant.reconnectDeadlineAt is not null
			  and participant.reconnectDeadlineAt <= :now
			order by participant.reconnectDeadlineAt asc
			""")
	List<RoomParticipant> findReconnectExpiredForUpdate(
			@Param("connectionStatus")
			SessionConnectionStatus connectionStatus,
			@Param("now")
			LocalDateTime now,
			Pageable pageable
	);
}
