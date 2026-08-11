package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.List;
import java.time.LocalDateTime;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import org.springframework.data.domain.Pageable;

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

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select session from WaitingRoom session where session.id = :sessionId")
	Optional<WaitingRoom> findByIdForUpdate(@Param("sessionId") Long sessionId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select session
			from WaitingRoom session
			where session.status = :status
			  and session.actualStartAt is not null
			  and session.timerExpiredNotifiedAt is null
			order by session.actualStartAt asc
			""")
	List<WaitingRoom> findActiveTimersForUpdate(
			@Param("status") RoomSessionStatus status,
			Pageable pageable
	);

	@Query("""
			select distinct session.id
			from WaitingRoom session
			join RoomParticipant absent on absent.room = session
			where session.sessionType = 'REAL_DATE'
			  and session.scheduledStartAt <= :deadline
			  and session.status in (
			      com.date.backend.domain.room.domain.RoomSessionStatus.CREATED,
			      com.date.backend.domain.room.domain.RoomSessionStatus.SCHEDULED,
			      com.date.backend.domain.room.domain.RoomSessionStatus.WAITING,
			      com.date.backend.domain.room.domain.RoomSessionStatus.READY
			  )
			  and absent.joinedAt is null
			  and exists (
			      select joined.id
			      from RoomParticipant joined
			      where joined.room = session
			        and joined.joinedAt is not null
			  )
			  and not exists (
			      select penalty.id
			      from AttendancePenalty penalty
			      where penalty.sessionId = session.id
			        and penalty.userId = absent.userId
			        and penalty.penaltyType = 'NO_SHOW'
			  )
			order by session.id
			""")
	List<Long> findNoShowCandidateIds(
			@Param("deadline") LocalDateTime deadline,
			Pageable pageable
	);
}
