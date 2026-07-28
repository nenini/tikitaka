package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
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

public interface MatchJobRepository extends JpaRepository<MatchJob, Long> {

	boolean existsByMatchRequest_IdAndStatusIn(
			Long matchRequestId,
			Collection<MatchJobStatus> statuses
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = "matchRequest")
	@Query("""
			SELECT job
			FROM MatchJob job
			WHERE job.status = :status
			AND job.availableAt <= :now
			ORDER BY job.availableAt, job.id
			""")
	List<MatchJob> findClaimableForUpdate(
			@Param("status") MatchJobStatus status,
			@Param("now") LocalDateTime now,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = "matchRequest")
	@Query("SELECT job FROM MatchJob job WHERE job.id = :jobId")
	Optional<MatchJob> findByIdForUpdate(@Param("jobId") Long jobId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = "matchRequest")
	@Query("""
			SELECT job
			FROM MatchJob job
			WHERE job.status = :status
			AND job.claimedAt <= :claimedBefore
			ORDER BY job.claimedAt, job.id
			""")
	List<MatchJob> findStaleProcessingForUpdate(
			@Param("status") MatchJobStatus status,
			@Param("claimedBefore") LocalDateTime claimedBefore,
			Pageable pageable
	);
}
