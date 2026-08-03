ALTER TABLE `reports`
    ADD COLUMN `sessionStatusSnapshot` VARCHAR(30) NULL;

CREATE UNIQUE INDEX `UK_reports_session_reporter_reported`
    ON `reports` (`sessionId`, `reporterUserId`, `reportedUserId`);

CREATE TABLE `report_evidences` (
    `reportEvidenceId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `reportId` BIGINT NOT NULL,
    `evidenceType` VARCHAR(30) NOT NULL,
    `objectKey` VARCHAR(1000) NOT NULL,
    `originalFileName` VARCHAR(255) NULL,
    `contentType` VARCHAR(100) NULL,
    `sizeBytes` BIGINT NOT NULL,
    `capturedAt` DATETIME(6) NULL,
    CONSTRAINT `CK_report_evidences_size`
        CHECK (`sizeBytes` >= 0),
    CONSTRAINT `FK_reports_TO_report_evidences`
        FOREIGN KEY (`reportId`) REFERENCES `reports` (`reportId`)
        ON DELETE CASCADE
);

CREATE INDEX `IDX_report_evidences_report`
    ON `report_evidences` (`reportId`, `reportEvidenceId`);
