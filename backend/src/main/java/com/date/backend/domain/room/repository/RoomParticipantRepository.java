package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.RoomParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {
	List<RoomParticipant> findAllByRoom_IdOrderByUserIdAsc(Long roomId);
}
