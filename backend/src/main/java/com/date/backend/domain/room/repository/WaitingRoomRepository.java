package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;

public interface WaitingRoomRepository extends JpaRepository<WaitingRoom, Long> {

	@EntityGraph(attributePaths = "matchPair")
	Optional<WaitingRoom> findWithMatchPairById(Long id);

	boolean existsByMatchPair_Id(Long matchPairId);

	Optional<WaitingRoom> findByMatchPair_Id(Long matchPairId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select session
			from WaitingRoom session
			join fetch session.matchPair
			where session.id = :sessionId
			""")
	Optional<WaitingRoom> findWithMatchPairByIdForUpdate(
			@Param("sessionId") Long sessionId
	);
}
