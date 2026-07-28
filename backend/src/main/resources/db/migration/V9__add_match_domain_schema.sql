ALTER TABLE `match_requests`
    ADD COLUMN `preferredAgeMin` SMALLINT NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `preferredAgeMax` SMALLINT NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `preferredFaceTagId` BIGINT NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `actualFaceTagId` BIGINT NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `matchedAt` DATETIME NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `expiresAt` DATETIME NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `cancellationReason` VARCHAR(500) NULL;
ALTER TABLE `match_requests`
    ADD COLUMN `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `match_requests`
    MODIFY COLUMN `preferredAgeMin` SMALLINT NOT NULL;
ALTER TABLE `match_requests`
    MODIFY COLUMN `preferredAgeMax` SMALLINT NOT NULL;
ALTER TABLE `match_requests`
    MODIFY COLUMN `preferredFaceTagId` BIGINT NOT NULL;
ALTER TABLE `match_requests`
    MODIFY COLUMN `actualFaceTagId` BIGINT NOT NULL;

ALTER TABLE `match_requests`
    ADD CONSTRAINT `FK_face_tag_catalog_TO_match_requests_preferred`
        FOREIGN KEY (`preferredFaceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`);
ALTER TABLE `match_requests`
    ADD CONSTRAINT `FK_face_tag_catalog_TO_match_requests_actual`
        FOREIGN KEY (`actualFaceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`);
ALTER TABLE `match_requests`
    ADD CONSTRAINT `CK_match_requests_preferred_age`
        CHECK (
            (`preferredAgeMin` IS NULL AND `preferredAgeMax` IS NULL)
            OR (
                `preferredAgeMin` > 0
                AND `preferredAgeMax` >= `preferredAgeMin`
            )
        );
ALTER TABLE `match_requests`
    ADD CONSTRAINT `CK_match_requests_status`
        CHECK (
            `status` IN (
                'WAITING',
                'MATCH_FOUND',
                'CONFIRMED',
                'CANCELLED',
                'EXPIRED'
            )
        );

CREATE INDEX `IDX_match_requests_status_requested`
    ON `match_requests` (`status`, `requestedAt`, `matchRequestId`);

CREATE TABLE `active_match_requests` (
    `userId` BIGINT NOT NULL,
    `matchRequestId` BIGINT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `PK_active_match_requests` PRIMARY KEY (`userId`),
    CONSTRAINT `UK_active_match_requests_request` UNIQUE (`matchRequestId`),
    CONSTRAINT `FK_users_TO_active_match_requests`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_match_requests_TO_active_match_requests`
        FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`)
);

CREATE TABLE `match_request_slots` (
    `matchRequestSlotId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `matchRequestId` BIGINT NOT NULL,
    `dayOfWeek` VARCHAR(10) NOT NULL,
    `startTime` TIME NOT NULL,
    `endTime` TIME NOT NULL,
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `UK_match_request_slots`
        UNIQUE (`matchRequestId`, `dayOfWeek`, `startTime`, `endTime`),
    CONSTRAINT `FK_match_requests_TO_match_request_slots`
        FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
    CONSTRAINT `CK_match_request_slots_day`
        CHECK (
            `dayOfWeek` IN (
                'MONDAY',
                'TUESDAY',
                'WEDNESDAY',
                'THURSDAY',
                'FRIDAY',
                'SATURDAY',
                'SUNDAY'
            )
        ),
    CONSTRAINT `CK_match_request_slots_time`
        CHECK (`startTime` < `endTime`)
);

CREATE INDEX `IDX_match_request_slots_request_day`
    ON `match_request_slots` (`matchRequestId`, `dayOfWeek`);

CREATE TABLE `match_request_trait_snapshots` (
    `matchRequestTraitSnapshotId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `matchRequestId` BIGINT NOT NULL,
    `traitId` BIGINT NOT NULL,
    `snapshotType` VARCHAR(20) NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `UK_match_request_trait_snapshots`
        UNIQUE (`matchRequestId`, `traitId`, `snapshotType`),
    CONSTRAINT `FK_match_requests_TO_trait_snapshots`
        FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
    CONSTRAINT `FK_trait_catalog_TO_match_request_trait_snapshots`
        FOREIGN KEY (`traitId`) REFERENCES `trait_catalog` (`traitId`),
    CONSTRAINT `CK_match_request_trait_snapshots_type`
        CHECK (`snapshotType` IN ('SELF', 'PREFERRED'))
);

CREATE INDEX `IDX_match_request_trait_snapshots_request_type`
    ON `match_request_trait_snapshots` (`matchRequestId`, `snapshotType`);

ALTER TABLE `match_pairs`
    ADD COLUMN `faceScore` DECIMAL(6, 3) NOT NULL DEFAULT 0;
ALTER TABLE `match_pairs`
    ADD COLUMN `traitScore` DECIMAL(6, 3) NOT NULL DEFAULT 0;
ALTER TABLE `match_pairs`
    ADD COLUMN `scheduledAt` DATETIME NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `confirmedAt` DATETIME NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `cancelledAt` DATETIME NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `cancelledBy` BIGINT NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `cancellationReason` VARCHAR(500) NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `isLateCancellation` BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE `match_pairs`
    ADD COLUMN `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `match_pairs`
    MODIFY COLUMN `totalScore` DECIMAL(6, 3) NOT NULL;
ALTER TABLE `match_pairs`
    MODIFY COLUMN `acceptDeadlineAt` DATETIME NOT NULL;

ALTER TABLE `match_pairs`
    ADD CONSTRAINT `UK_match_pairs_requests`
        UNIQUE (`requesterAId`, `requesterBId`);
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `FK_users_TO_match_pairs_cancelled_by`
        FOREIGN KEY (`cancelledBy`) REFERENCES `users` (`userId`);
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_distinct_requests`
        CHECK (`requesterAId` < `requesterBId`);
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_distinct_users`
        CHECK (`userAId` <> `userBId`);
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_scores`
        CHECK (
            `faceScore` >= 0
            AND `faceScore` <= 50
            AND `traitScore` >= 0
            AND `traitScore` <= 50
            AND `totalScore` >= 0
            AND `totalScore` <= 100
        );
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_status`
        CHECK (
            `status` IN (
                'PENDING_ACCEPTANCE',
                'CONFIRMED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED'
            )
        );

CREATE INDEX `IDX_match_pairs_status_deadline`
    ON `match_pairs` (`status`, `acceptDeadlineAt`);

ALTER TABLE `match_responses`
    ADD CONSTRAINT `UK_match_responses_pair_user`
        UNIQUE (`match_pair_id`, `user_id`);
ALTER TABLE `match_responses`
    ADD CONSTRAINT `CK_match_responses_response`
        CHECK (`response` IN ('PENDING', 'ACCEPTED', 'REJECTED'));
