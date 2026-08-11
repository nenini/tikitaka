CREATE TABLE `ai_coaching_events` (
    `event_id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `target_user_id` BIGINT NOT NULL,
    `event_type` VARCHAR(40) NOT NULL,
    `version` INT NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `coaching_type` VARCHAR(50) NOT NULL,
    `message_key` VARCHAR(100) NOT NULL,
    `message_text` VARCHAR(500),
    `priority` VARCHAR(20) NOT NULL,
    `reason_code` VARCHAR(100) NOT NULL,
    `triggered_elapsed_ms` BIGINT NOT NULL,
    `expires_elapsed_ms` BIGINT NOT NULL,
    `deduplication_key` VARCHAR(255) NOT NULL,
    `delivery_status` VARCHAR(20) NOT NULL,
    `occurred_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    `delivered_at` DATETIME(6),
    CONSTRAINT `UK_ai_coaching_events_deduplication`
        UNIQUE (`deduplication_key`),
    CONSTRAINT `FK_sessions_TO_ai_coaching_events`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_ai_coaching_events`
        FOREIGN KEY (`target_user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_ai_coaching_events_version`
        CHECK (`version` > 0),
    CONSTRAINT `CK_ai_coaching_events_elapsed`
        CHECK (`triggered_elapsed_ms` >= 0
            AND `expires_elapsed_ms` >= `triggered_elapsed_ms`),
    CONSTRAINT `CK_ai_coaching_events_status`
        CHECK (`delivery_status` IN ('DELIVERED', 'EXPIRED', 'SUPPRESSED'))
);

CREATE INDEX `IDX_ai_coaching_exposure_policy`
    ON `ai_coaching_events`
        (`session_id`, `target_user_id`, `coaching_type`, `delivery_status`, `delivered_at`);

CREATE INDEX `IDX_ai_coaching_session_received`
    ON `ai_coaching_events` (`session_id`, `received_at`);
