package com.date.backend.domain.growth.repository;
import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface BadgeProgressRepository extends JpaRepository<WaitingRoom, Long> {
    @Query(value = """
            SELECT COUNT(*) FROM sessions session
            JOIN session_participants participant ON participant.session_id = session.sessionId
            WHERE participant.user_id = :userId AND session.status = 'COMPLETED'
            """, nativeQuery = true)
    long countCompletedSessions(@Param("userId") Long userId);

    @Query(value = """
            SELECT COUNT(DISTINCT report.sessionId) FROM session_reports report
            WHERE report.userId = :userId AND report.reportStatus = 'COMPLETED'
            """, nativeQuery = true)
    long countCompletedReports(@Param("userId") Long userId);
}
