package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WaitingRoomRepository extends JpaRepository<WaitingRoom, Long> {

	@EntityGraph(attributePaths = "matchPair")
	Optional<WaitingRoom> findWithMatchPairById(Long id);

	boolean existsByMatchPair_Id(Long matchPairId);
}
