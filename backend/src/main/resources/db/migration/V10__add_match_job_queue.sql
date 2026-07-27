CREATE TABLE `match_jobs` (
    `matchJobId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `matchRequestId` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `attemptCount` INT NOT NULL DEFAULT 0,
    `availableAt` DATETIME NOT NULL,
    `claimedAt` DATETIME NULL,
    `completedAt` DATETIME NULL,
    `failedAt` DATETIME NULL,
    `workerId` VARCHAR(100) NULL,
    `lastError` VARCHAR(1000) NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `FK_match_requests_TO_match_jobs`
        FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
    CONSTRAINT `CK_match_jobs_status`
        CHECK (`status` IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    CONSTRAINT `CK_match_jobs_attempt_count`
        CHECK (`attemptCount` >= 0)
);

CREATE INDEX `IDX_match_jobs_claim`
    ON `match_jobs` (`status`, `availableAt`, `matchJobId`);

CREATE INDEX `IDX_match_jobs_request_status`
    ON `match_jobs` (`matchRequestId`, `status`);

ALTER TABLE `match_requests`
    ADD COLUMN `waitingStartedAt` DATETIME NULL;

UPDATE `match_requests`
SET `waitingStartedAt` = COALESCE(`updatedAt`, `requestedAt`)
WHERE `waitingStartedAt` IS NULL;

ALTER TABLE `match_requests`
    MODIFY COLUMN `waitingStartedAt` DATETIME NOT NULL;

CREATE INDEX `IDX_match_requests_status_waiting_started`
    ON `match_requests` (`status`, `waitingStartedAt`, `matchRequestId`);
