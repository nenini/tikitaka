package com.date.backend.domain.growth.repository;

import com.date.backend.domain.growth.domain.GrowthMetricSnapshot;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.*;

public interface GrowthMetricSnapshotRepository extends JpaRepository<GrowthMetricSnapshot, Long> {
    Optional<GrowthMetricSnapshot> findBySessionReportIdAndAggregationVersion(Long reportId, String version);

    @Query(value = """
            SELECT flowScore, questionScore, listeningScore, reactionScore, balanceScore, nonverbalScore
            FROM growth_metric_snapshots
            WHERE userId = :userId AND measuredAt >= :fromAt AND measuredAt < :toAt
            """, nativeQuery = true)
    List<Object[]> findScores(@Param("userId") Long userId, @Param("fromAt") LocalDateTime fromAt,
                              @Param("toAt") LocalDateTime toAt);
}
