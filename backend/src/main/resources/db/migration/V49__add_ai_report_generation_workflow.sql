ALTER TABLE `session_reports` ADD COLUMN `analysisVersion` VARCHAR(50) NULL;
ALTER TABLE `session_reports` ADD COLUMN `reportVersion` VARCHAR(50) NULL;
ALTER TABLE `session_reports` ADD COLUMN `generationMode` VARCHAR(20) NULL;
ALTER TABLE `session_reports` ADD COLUMN `failureCode` VARCHAR(80) NULL;
ALTER TABLE `session_reports` ADD COLUMN `failureReason` VARCHAR(1000) NULL;
ALTER TABLE `session_reports` ADD COLUMN `resultPayloadHash` VARCHAR(64) NULL;
ALTER TABLE `session_reports` ADD COLUMN `requestedAt` DATETIME(6) NULL;
ALTER TABLE `session_reports` ADD COLUMN `generationStartedAt` DATETIME(6) NULL;
ALTER TABLE `session_reports` ADD COLUMN `lastAttemptAt` DATETIME(6) NULL;
ALTER TABLE `session_reports` ADD COLUMN `attemptCount` INT NOT NULL DEFAULT 0;
ALTER TABLE `session_reports` ADD COLUMN `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `session_reports` ADD CONSTRAINT `UK_session_reports_session_user`
    UNIQUE (`sessionId`, `userId`);
ALTER TABLE `session_reports` ADD CONSTRAINT `FK_sessions_TO_session_reports`
    FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`);
ALTER TABLE `session_reports` ADD CONSTRAINT `FK_users_TO_session_reports`
    FOREIGN KEY (`userId`) REFERENCES `users` (`userId`);
ALTER TABLE `session_reports` ADD CONSTRAINT `CK_session_report_status`
    CHECK (`reportStatus` IN ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED'));
ALTER TABLE `session_reports` ADD CONSTRAINT `CK_session_report_attempt_count`
    CHECK (`attemptCount` >= 0);
ALTER TABLE `session_reports` ADD CONSTRAINT `CK_session_report_generation_mode`
    CHECK (`generationMode` IS NULL OR `generationMode` IN ('LLM', 'RULE_BASED', 'NONE'));

CREATE INDEX `IDX_session_reports_status_requested`
    ON `session_reports` (`reportStatus`, `requestedAt`);
