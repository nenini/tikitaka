package com.date.backend.domain.growth.repository;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CompletedReportMetricRepository extends JpaRepository<WaitingRoom, Long> {
    @Query(value = """
            SELECT report.sessionReportId AS reportId, report.sessionId AS sessionId,
                   report.userId AS userId, 'legacy-v1' AS analysisVersion,
                   report.aiFlowScore AS flowScore, report.aiQuestionScore AS questionScore,
                   report.aiListeningScore AS listeningScore, report.aiReactionScore AS reactionScore,
                   report.aiMannerScore AS balanceScore, report.aiNonverbalScore AS nonverbalScore,
                   COALESCE(report.generatedAt, report.createdAt) AS measuredAt
            FROM session_reports report
            WHERE report.userId = :userId AND report.reportStatus = 'COMPLETED'
            """, nativeQuery = true)
    List<CompletedReportMetricProjection> findCompletedMetrics(@Param("userId") Long userId);
}
