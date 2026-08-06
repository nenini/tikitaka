package com.date.backend.domain.growth.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "growth_metric_snapshots", uniqueConstraints =
        @UniqueConstraint(name = "uk_growth_snapshot_report_version", columnNames = {"sessionReportId", "aggregationVersion"}))
public class GrowthMetricSnapshot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long growthMetricSnapshotId;
    @Column(nullable = false) private Long sessionReportId;
    @Column(nullable = false) private Long sessionId;
    @Column(nullable = false) private Long userId;
    @Column(nullable = false, length = 50) private String analysisVersion;
    @Column(nullable = false, length = 50) private String aggregationVersion;
    private BigDecimal flowScore;
    private BigDecimal questionScore;
    private BigDecimal listeningScore;
    private BigDecimal reactionScore;
    private BigDecimal balanceScore;
    private BigDecimal nonverbalScore;
    @Column(nullable = false) private LocalDateTime measuredAt;
    @Column(nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(nullable = false) private LocalDateTime updatedAt;

    protected GrowthMetricSnapshot() {}

    public GrowthMetricSnapshot(Long reportId, Long sessionId, Long userId, String analysisVersion,
                                String aggregationVersion, BigDecimal flow, BigDecimal question,
                                BigDecimal listening, BigDecimal reaction, BigDecimal balance,
                                BigDecimal nonverbal, LocalDateTime measuredAt) {
        this.sessionReportId = reportId; this.sessionId = sessionId; this.userId = userId;
        this.analysisVersion = analysisVersion; this.aggregationVersion = aggregationVersion;
        this.measuredAt = measuredAt; updateScores(flow, question, listening, reaction, balance, nonverbal);
    }

    public void updateFrom(String analysisVersion, BigDecimal flow, BigDecimal question,
                           BigDecimal listening, BigDecimal reaction, BigDecimal balance,
                           BigDecimal nonverbal, LocalDateTime measuredAt) {
        this.analysisVersion = analysisVersion; this.measuredAt = measuredAt;
        updateScores(flow, question, listening, reaction, balance, nonverbal);
    }

    private void updateScores(BigDecimal flow, BigDecimal question, BigDecimal listening,
                              BigDecimal reaction, BigDecimal balance, BigDecimal nonverbal) {
        this.flowScore = flow; this.questionScore = question; this.listeningScore = listening;
        this.reactionScore = reaction; this.balanceScore = balance; this.nonverbalScore = nonverbal;
    }

    @PrePersist void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate void onUpdate() { updatedAt = LocalDateTime.now(); }
}
