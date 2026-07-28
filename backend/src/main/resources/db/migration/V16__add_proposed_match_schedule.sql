ALTER TABLE `match_pairs`
    ADD COLUMN `proposedScheduledAt` DATETIME NULL
        AFTER `matchedAt`;

UPDATE `match_pairs`
SET `proposedScheduledAt` = COALESCE(`scheduledAt`, `acceptDeadlineAt`)
WHERE `proposedScheduledAt` IS NULL;

ALTER TABLE `match_pairs`
    MODIFY COLUMN `proposedScheduledAt` DATETIME NOT NULL;

ALTER TABLE `match_requests`
    ADD COLUMN `rejectedAt` DATETIME NULL
        AFTER `cancelledAt`;

ALTER TABLE `match_requests`
    DROP CONSTRAINT `CK_match_requests_status`;

ALTER TABLE `match_requests`
    ADD CONSTRAINT `CK_match_requests_status`
        CHECK (
            `status` IN (
                'WAITING',
                'MATCH_FOUND',
                'CONFIRMED',
                'REJECTED',
                'CANCELLED',
                'EXPIRED'
            )
        );

CREATE INDEX `IDX_match_pairs_proposed_schedule`
    ON `match_pairs` (`status`, `proposedScheduledAt`);
