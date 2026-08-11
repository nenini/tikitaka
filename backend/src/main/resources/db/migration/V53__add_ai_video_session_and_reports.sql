ALTER TABLE `sessions`
    MODIFY COLUMN `matchPairId` BIGINT;

ALTER TABLE `sessions`
    ADD COLUMN `scenario` VARCHAR(20) NULL AFTER `sessionType`;

ALTER TABLE `sessions`
    ADD COLUMN `cameraEnabled` BOOLEAN NOT NULL DEFAULT TRUE AFTER `scenario`;

CREATE TABLE `voice_session_analyses` (
    `voice_analysis_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `schema_version` INT NOT NULL,
    `analysis_version` VARCHAR(128) NOT NULL,
    `session_duration_ms` BIGINT NOT NULL,
    `analyzed_at` DATETIME(6) NOT NULL,
    `metrics_json` LONGTEXT NOT NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_voice_analysis_version`
        UNIQUE (`session_id`, `user_id`, `analysis_version`),
    CONSTRAINT `FK_sessions_TO_voice_session_analyses`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_voice_session_analyses`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_voice_analysis_schema_version` CHECK (`schema_version` > 0),
    CONSTRAINT `CK_voice_analysis_duration` CHECK (`session_duration_ms` > 0)
);

CREATE TABLE `voice_session_reports` (
    `voice_report_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `schema_version` INT NOT NULL,
    `analysis_version` VARCHAR(128) NOT NULL,
    `report_version` VARCHAR(128) NOT NULL,
    `report_status` VARCHAR(20) NOT NULL,
    `generation_mode` VARCHAR(20) NOT NULL,
    `headline` VARCHAR(1000) NULL,
    `notes_json` LONGTEXT NOT NULL,
    `next_mission` VARCHAR(1000) NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `generated_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_voice_report_version`
        UNIQUE (`session_id`, `user_id`, `report_version`),
    CONSTRAINT `FK_sessions_TO_voice_session_reports`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_voice_session_reports`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_voice_report_schema_version` CHECK (`schema_version` > 0),
    CONSTRAINT `CK_voice_report_status`
        CHECK (`report_status` IN ('COMPLETED', 'FALLBACK', 'FAILED'))
);

CREATE INDEX `IDX_voice_analysis_session_user`
    ON `voice_session_analyses` (`session_id`, `user_id`);
CREATE INDEX `IDX_voice_report_session_user`
    ON `voice_session_reports` (`session_id`, `user_id`);
