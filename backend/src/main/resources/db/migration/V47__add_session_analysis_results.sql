CREATE TABLE `session_analysis_receipts` (
    `analysis_receipt_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `schema_version` INT NOT NULL,
    `analysis_version` VARCHAR(50) NOT NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `duration_ms` BIGINT NOT NULL,
    `analyzed_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_session_analysis_version` UNIQUE (`session_id`, `analysis_version`),
    CONSTRAINT `FK_sessions_TO_session_analysis_receipts`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `CK_session_analysis_schema_version` CHECK (`schema_version` > 0),
    CONSTRAINT `CK_session_analysis_duration` CHECK (`duration_ms` > 0)
);

CREATE TABLE `session_participant_analyses` (
    `participant_analysis_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `analysis_receipt_id` BIGINT NOT NULL,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `analysis_status` VARCHAR(20) NOT NULL,
    `axes_json` LONGTEXT,
    `metrics_json` LONGTEXT,
    `created_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_session_participant_analysis` UNIQUE (`analysis_receipt_id`, `user_id`),
    CONSTRAINT `FK_analysis_receipts_TO_participant_analyses`
        FOREIGN KEY (`analysis_receipt_id`) REFERENCES `session_analysis_receipts` (`analysis_receipt_id`),
    CONSTRAINT `FK_sessions_TO_participant_analyses`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_participant_analyses`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_participant_analysis_status`
        CHECK (`analysis_status` IN ('COMPLETED', 'FAILED'))
);

CREATE TABLE `session_analysis_evidence_segments` (
    `evidence_segment_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `participant_analysis_id` BIGINT NOT NULL,
    `evidence_key` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(30) NOT NULL,
    `start_ms` BIGINT NOT NULL,
    `end_ms` BIGINT NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    CONSTRAINT `UK_participant_analysis_evidence`
        UNIQUE (`participant_analysis_id`, `evidence_key`),
    CONSTRAINT `FK_participant_analyses_TO_evidence_segments`
        FOREIGN KEY (`participant_analysis_id`)
        REFERENCES `session_participant_analyses` (`participant_analysis_id`),
    CONSTRAINT `CK_analysis_evidence_type`
        CHECK (`event_type` IN ('LONG_SILENCE', 'INTERRUPTION', 'BACKCHANNEL', 'GAZE_AWAY', 'FACE_MISSING', 'SMILE')),
    CONSTRAINT `CK_analysis_evidence_range`
        CHECK (`start_ms` >= 0 AND `end_ms` >= `start_ms`)
);

CREATE INDEX `IDX_session_analysis_received_at`
    ON `session_analysis_receipts` (`received_at`);
CREATE INDEX `IDX_participant_analysis_session_user`
    ON `session_participant_analyses` (`session_id`, `user_id`);
