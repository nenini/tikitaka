package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MatchRequestRepository extends JpaRepository<MatchRequest, Long> {

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	@Query("SELECT request FROM MatchRequest request WHERE request.id = :id")
	Optional<MatchRequest> findByIdWithFaceTags(@Param("id") Long id);

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	Optional<MatchRequest> findFirstByUserIdAndStatusInOrderByRequestedAtDesc(
			Long userId,
			Collection<MatchRequestStatus> statuses
	);

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	List<MatchRequest> findAllByStatusOrderByRequestedAtAscIdAsc(
			MatchRequestStatus status
	);

	@Query("""
			SELECT request
			FROM MatchRequest request
			WHERE request.status = :status
			AND request.waitingStartedAt <= :waitingStartedBefore
			AND (
				request.settingRecommendationSentAt IS NULL
				OR request.settingRecommendationSentAt < request.waitingStartedAt
			)
			AND EXISTS (
				SELECT active.userId
				FROM ActiveMatchRequest active
				WHERE active.matchRequest = request
			)
			ORDER BY request.waitingStartedAt, request.id
			""")
	List<MatchRequest> findWaitingRecommendationTargets(
			@Param("status") MatchRequestStatus status,
			@Param("waitingStartedBefore") LocalDateTime waitingStartedBefore,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT request
			FROM MatchRequest request
			WHERE request.status = :status
			AND request.waitingStartedAt <= :waitingStartedBefore
			AND (
				request.settingRecommendationSentAt IS NULL
				OR request.settingRecommendationSentAt < request.waitingStartedAt
			)
			AND EXISTS (
				SELECT active.userId
				FROM ActiveMatchRequest active
				WHERE active.matchRequest = request
			)
			ORDER BY request.waitingStartedAt, request.id
			""")
	List<MatchRequest> findUnnotifiedWaitingRecommendationTargetsForUpdate(
			@Param("status") MatchRequestStatus status,
			@Param("waitingStartedBefore") LocalDateTime waitingStartedBefore,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT request
			FROM MatchRequest request
			WHERE request.id IN :ids
			ORDER BY request.id
			""")
	List<MatchRequest> findAllByIdForUpdate(@Param("ids") Collection<Long> ids);
}
