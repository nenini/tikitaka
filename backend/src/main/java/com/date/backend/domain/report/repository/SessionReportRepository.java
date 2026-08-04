package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.SessionReport;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;
import org.springframework.data.domain.Pageable;
import com.date.backend.domain.report.domain.SessionReportStatus;

public interface SessionReportRepository extends JpaRepository<SessionReport, Long> {
	List<SessionReport> findAllBySessionIdOrderByUserIdAsc(Long sessionId);
	boolean existsBySessionIdAndUserId(Long sessionId, Long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select report from SessionReport report where report.sessionId = :sessionId and report.userId = :userId")
	Optional<SessionReport> findBySessionIdAndUserIdForUpdate(
			@Param("sessionId") Long sessionId,
			@Param("userId") Long userId
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select report from SessionReport report where report.sessionId = :sessionId order by report.userId")
	List<SessionReport> findAllBySessionIdForUpdate(@Param("sessionId") Long sessionId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select report from SessionReport report
			where report.status = :status
			  and report.generationStartedAt is not null
			  and report.generationStartedAt <= :cutoff
			order by report.generationStartedAt
			""")
	List<SessionReport> findTimedOutForUpdate(
			@Param("status") SessionReportStatus status,
			@Param("cutoff") LocalDateTime cutoff,
			Pageable pageable
	);
}
