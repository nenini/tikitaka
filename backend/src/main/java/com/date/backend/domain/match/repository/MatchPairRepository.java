package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MatchPairRepository extends JpaRepository<MatchPair, Long> {

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = {"requestA", "requestB"})
	@Query("SELECT pair FROM MatchPair pair WHERE pair.id = :id")
	Optional<MatchPair> findByIdForUpdate(@Param("id") Long id);

	@EntityGraph(attributePaths = {"requestA", "requestB"})
	Optional<MatchPair> findFirstByUserAIdOrUserBIdOrderByMatchedAtDesc(
			Long userAId,
			Long userBId
	);

	@EntityGraph(attributePaths = {"requestA", "requestB"})
	@Query("""
			SELECT pair
			FROM MatchPair pair
			WHERE (pair.userAId = :userId OR pair.userBId = :userId)
			AND pair.status IN :statuses
			ORDER BY pair.matchedAt DESC, pair.id DESC
			""")
	List<MatchPair> findCurrentByParticipant(
			@Param("userId") Long userId,
			@Param("statuses") Collection<MatchStatus> statuses,
			Pageable pageable
	);

	@Query("""
			SELECT CASE WHEN COUNT(pair) > 0 THEN true ELSE false END
			FROM MatchPair pair
			WHERE (pair.userAId = :userId OR pair.userBId = :userId)
			AND pair.status IN :statuses
			""")
	boolean existsActiveByUserId(
			@Param("userId") Long userId,
			@Param("statuses") Collection<MatchStatus> statuses
	);

	@Query("""
			SELECT pair
			FROM MatchPair pair
			WHERE pair.status IN :statuses
			AND (pair.userAId IN :userIds OR pair.userBId IN :userIds)
			""")
	List<MatchPair> findAllActiveByParticipantUserIds(
			@Param("userIds") Collection<Long> userIds,
			@Param("statuses") Collection<MatchStatus> statuses
	);

	List<MatchPair> findAllByStatusAndAcceptDeadlineAtBefore(
			MatchStatus status,
			java.time.LocalDateTime deadline
	);
}
