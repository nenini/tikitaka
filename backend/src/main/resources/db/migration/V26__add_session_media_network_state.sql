ALTER TABLE `session_participants`
    ADD COLUMN `camera_enabled` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `session_participants`
    ADD COLUMN `microphone_enabled` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `session_participants`
    ADD COLUMN `network_quality` VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE `session_participants`
    ADD COLUMN `media_state_updated_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `network_quality_updated_at` DATETIME(6) NULL;
