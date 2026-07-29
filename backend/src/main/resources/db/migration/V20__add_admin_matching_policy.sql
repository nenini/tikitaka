CREATE TABLE `matching_policies` (
    `matchingPolicyId` BIGINT NOT NULL PRIMARY KEY,
    `faceTypeWeight` INT NOT NULL,
    `personalityWeight` INT NOT NULL,
    `acceptTimeoutHours` INT NOT NULL,
    `minimumAcceptanceWindowMinutes` INT NOT NULL,
    `minimumPreparationMinutes` INT NOT NULL,
    `scheduleSearchDays` INT NOT NULL,
    `recentMatchExclusionDays` INT NOT NULL,
    `lateCancellationMinutes` INT NOT NULL,
    `policyVersion` BIGINT NOT NULL,
    `updatedBy` BIGINT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `FK_users_TO_matching_policies_updated_by`
        FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_matching_policies_weights`
        CHECK (
            `faceTypeWeight` BETWEEN 0 AND 100
            AND `personalityWeight` BETWEEN 0 AND 100
            AND `faceTypeWeight` + `personalityWeight` = 100
        ),
    CONSTRAINT `CK_matching_policies_values`
        CHECK (
            `acceptTimeoutHours` BETWEEN 1 AND 24
            AND `minimumAcceptanceWindowMinutes` BETWEEN 1 AND (`acceptTimeoutHours` * 60)
            AND `minimumPreparationMinutes` BETWEEN 0 AND 1440
            AND `scheduleSearchDays` BETWEEN 1 AND 30
            AND `recentMatchExclusionDays` BETWEEN 1 AND 365
            AND `lateCancellationMinutes` BETWEEN 1 AND 1440
            AND `policyVersion` > 0
        )
);

INSERT INTO `matching_policies` (
    `matchingPolicyId`,
    `faceTypeWeight`,
    `personalityWeight`,
    `acceptTimeoutHours`,
    `minimumAcceptanceWindowMinutes`,
    `minimumPreparationMinutes`,
    `scheduleSearchDays`,
    `recentMatchExclusionDays`,
    `lateCancellationMinutes`,
    `policyVersion`,
    `updatedBy`
) VALUES (
    1,
    50,
    50,
    8,
    60,
    60,
    7,
    7,
    60,
    1,
    NULL
);

ALTER TABLE `match_pairs`
    ADD COLUMN `policyVersion` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `match_pairs`
    ADD COLUMN `lateCancellationMinutesSnapshot` INT NOT NULL DEFAULT 60;
ALTER TABLE `match_pairs`
    ADD COLUMN `recentMatchExclusionDaysSnapshot` INT NOT NULL DEFAULT 7;
ALTER TABLE `match_pairs`
    ADD COLUMN `closedAt` DATETIME NULL;
ALTER TABLE `match_pairs`
    ADD COLUMN `completedAt` DATETIME NULL;

ALTER TABLE `match_pairs`
    DROP CONSTRAINT `CK_match_pairs_scores`;
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_scores`
        CHECK (
            `faceScore` BETWEEN 0 AND 100
            AND `traitScore` BETWEEN 0 AND 100
            AND `totalScore` BETWEEN 0 AND 100
            AND `totalScore` = `faceScore` + `traitScore`
        );

ALTER TABLE `match_pairs`
    DROP CONSTRAINT `CK_match_pairs_status`;
ALTER TABLE `match_pairs`
    ADD CONSTRAINT `CK_match_pairs_status`
        CHECK (
            `status` IN (
                'PENDING_ACCEPTANCE',
                'CONFIRMED',
                'COMPLETED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED'
            )
        );

ALTER TABLE `match_requests`
    ADD COLUMN `completedAt` DATETIME NULL;
ALTER TABLE `match_requests`
    DROP CONSTRAINT `CK_match_requests_status`;
ALTER TABLE `match_requests`
    ADD CONSTRAINT `CK_match_requests_status`
        CHECK (
            `status` IN (
                'WAITING',
                'MATCH_FOUND',
                'CONFIRMED',
                'COMPLETED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED'
            )
        );

CREATE INDEX `IDX_match_pairs_user_a_cooldown`
    ON `match_pairs` (`userAId`, `status`, `closedAt`, `completedAt`);
CREATE INDEX `IDX_match_pairs_user_b_cooldown`
    ON `match_pairs` (`userBId`, `status`, `closedAt`, `completedAt`);
CREATE INDEX `IDX_match_pairs_confirmed_schedule`
    ON `match_pairs` (`status`, `scheduledAt`);
