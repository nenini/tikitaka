CREATE TABLE `ai_session_analysis_events` (
    `event_id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `analysis_type` VARCHAR(20) NOT NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `version` INT NOT NULL,
    `participant_identity` VARCHAR(255),
    `client_instance_id` VARCHAR(100),
    `sequence_number` BIGINT,
    `session_elapsed_ms` BIGINT NOT NULL,
    `confidence` DECIMAL(6, 5),
    `occurred_at` DATETIME(6) NOT NULL,
    `model_version` VARCHAR(100),
    `rule_version` VARCHAR(100),
    `payload_json` LONGTEXT NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    CONSTRAINT `FK_sessions_TO_ai_session_analysis_events`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_ai_session_analysis_events`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_ai_session_analysis_events_type`
        CHECK (`analysis_type` IN ('VOICE', 'VISION')),
    CONSTRAINT `CK_ai_session_analysis_events_version`
        CHECK (`version` > 0),
    CONSTRAINT `CK_ai_session_analysis_events_elapsed`
        CHECK (`session_elapsed_ms` >= 0),
    CONSTRAINT `CK_ai_session_analysis_events_confidence`
        CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1))
);

CREATE INDEX `IDX_ai_analysis_session_user_elapsed`
    ON `ai_session_analysis_events` (`session_id`, `user_id`, `session_elapsed_ms`);

CREATE INDEX `IDX_ai_analysis_session_type_event`
    ON `ai_session_analysis_events` (`session_id`, `analysis_type`, `event_type`);
