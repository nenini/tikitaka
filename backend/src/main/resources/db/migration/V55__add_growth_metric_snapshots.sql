CREATE TABLE growth_metric_snapshots (
    growthMetricSnapshotId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sessionReportId BIGINT NOT NULL,
    sessionId BIGINT NOT NULL,
    userId BIGINT NOT NULL,
    analysisVersion VARCHAR(50) NOT NULL,
    aggregationVersion VARCHAR(50) NOT NULL,
    flowScore DECIMAL(5, 2) NULL,
    questionScore DECIMAL(5, 2) NULL,
    listeningScore DECIMAL(5, 2) NULL,
    reactionScore DECIMAL(5, 2) NULL,
    balanceScore DECIMAL(5, 2) NULL,
    nonverbalScore DECIMAL(5, 2) NULL,
    measuredAt DATETIME(6) NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_growth_snapshot_report_version
        UNIQUE (sessionReportId, aggregationVersion),
    CONSTRAINT fk_growth_snapshot_report
        FOREIGN KEY (sessionReportId) REFERENCES session_reports (sessionReportId),
    CONSTRAINT fk_growth_snapshot_session
        FOREIGN KEY (sessionId) REFERENCES sessions (sessionId),
    CONSTRAINT fk_growth_snapshot_user
        FOREIGN KEY (userId) REFERENCES users (userId),
    INDEX idx_growth_snapshot_user_measured (userId, measuredAt),
    INDEX idx_growth_snapshot_user_session (userId, sessionId)
);
