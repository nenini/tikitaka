package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.RoomDeviceCheck;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoomDeviceCheckRepository extends JpaRepository<RoomDeviceCheck, Long> {
	Optional<RoomDeviceCheck> findFirstByRoom_IdAndUserIdOrderByCheckedAtDescIdDesc(
			Long roomId,
			Long userId
	);
}
