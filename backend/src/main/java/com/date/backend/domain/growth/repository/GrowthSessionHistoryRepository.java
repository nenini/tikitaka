package com.date.backend.domain.growth.repository;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface GrowthSessionHistoryRepository extends JpaRepository<WaitingRoom, Long> {
	@Query(value = """
			SELECT session.sessionId AS sessionId,
			       session.status AS sessionStatus,
			       session.scheduledStartAt AS scheduledStartAt,
			       session.actualStartAt AS actualStartAt,
			       session.actualEndAt AS actualEndAt,
			       report.sessionReportId AS reportId,
			       report.reportStatus AS reportStatus
			FROM sessions session
			JOIN session_participants participant
			  ON participant.session_id = session.sessionId
			LEFT JOIN session_reports report
			  ON report.sessionReportId = (
			      SELECT MAX(candidate.sessionReportId)
			      FROM session_reports candidate
			      WHERE candidate.sessionId = session.sessionId
			        AND candidate.userId = :userId
			  )
			WHERE participant.user_id = :userId
			  AND session.status IN ('COMPLETED', 'CANCELLED')
			  AND session.actualStartAt IS NOT NULL
			  AND session.actualEndAt IS NOT NULL
			  AND (:status IS NULL OR session.status = :status)
			  AND (:cursor IS NULL OR session.sessionId < :cursor)
			  AND (:fromAt IS NULL OR session.actualStartAt >= :fromAt)
			  AND (:toAt IS NULL OR session.actualStartAt < :toAt)
			ORDER BY session.sessionId DESC
			""", nativeQuery = true)
	List<GrowthSessionHistoryProjection> findHistory(
			@Param("userId") Long userId,
			@Param("cursor") Long cursor,
			@Param("fromAt") LocalDateTime fromAt,
			@Param("toAt") LocalDateTime toAt,
			@Param("status") String status,
			Pageable pageable
	);
}
