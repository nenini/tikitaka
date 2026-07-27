ALTER TABLE `notifications`
    ADD COLUMN `presentation` VARCHAR(30) NOT NULL DEFAULT 'BELL_AND_TOAST'
        AFTER `relatedId`,
    ADD COLUMN `deduplicationKey` VARCHAR(200) NULL
        AFTER `presentation`,
    ADD CONSTRAINT `UK_notifications_deduplication_key`
        UNIQUE (`deduplicationKey`);

CREATE INDEX `IDX_notifications_user_read_sent`
    ON `notifications` (`userId`, `isRead`, `sentAt`, `notificationId`);

CREATE INDEX `IDX_notifications_related`
    ON `notifications` (`relatedType`, `relatedId`);

CREATE TABLE `notification_jobs` (
    `notificationJobId` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `notificationType` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` VARCHAR(1000) NOT NULL,
    `relatedType` VARCHAR(30) NULL,
    `relatedId` BIGINT NULL,
    `presentation` VARCHAR(30) NOT NULL DEFAULT 'BELL_AND_TOAST',
    `deduplicationKey` VARCHAR(200) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `scheduledAt` DATETIME NOT NULL,
    `availableAt` DATETIME NOT NULL,
    `attemptCount` INT NOT NULL DEFAULT 0,
    `claimedAt` DATETIME NULL,
    `completedAt` DATETIME NULL,
    `cancelledAt` DATETIME NULL,
    `failedAt` DATETIME NULL,
    `workerId` VARCHAR(100) NULL,
    `lastError` VARCHAR(1000) NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`notificationJobId`),
    CONSTRAINT `UK_notification_jobs_deduplication_key`
        UNIQUE (`deduplicationKey`),
    CONSTRAINT `FK_users_TO_notification_jobs_1`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
);

CREATE INDEX `IDX_notification_jobs_claim`
    ON `notification_jobs` (`status`, `availableAt`, `notificationJobId`);

CREATE INDEX `IDX_notification_jobs_reference`
    ON `notification_jobs` (`relatedType`, `relatedId`, `status`);

CREATE INDEX `IDX_notification_jobs_user`
    ON `notification_jobs` (`userId`, `createdAt`);
