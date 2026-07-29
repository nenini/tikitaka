package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.RoomParticipant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
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
}
