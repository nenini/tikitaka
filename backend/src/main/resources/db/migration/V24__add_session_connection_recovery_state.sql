ALTER TABLE `session_participants`
    ADD COLUMN `client_instance_id` VARCHAR(100) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `last_heartbeat_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `reconnecting_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `reconnect_deadline_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `reconnected_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `recovery_failed_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `reconnect_attempt_count` INT NOT NULL DEFAULT 0;

CREATE INDEX `IDX_session_participants_heartbeat_monitor`
    ON `session_participants` (
        `connection_status`,
        `last_heartbeat_at`
    );

CREATE INDEX `IDX_session_participants_reconnect_monitor`
    ON `session_participants` (
        `connection_status`,
        `reconnect_deadline_at`
    );
