ALTER TABLE `session_participants`
    ADD COLUMN `participant_identity` VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE `session_participants`
    ADD COLUMN `participant_sid` VARCHAR(255) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `connection_status` VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED';

ALTER TABLE `session_participants`
    ADD COLUMN `connected_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `disconnected_at` DATETIME(6) NULL;

ALTER TABLE `session_participants`
    ADD COLUMN `last_connection_event_at` DATETIME(6) NULL;

UPDATE `session_participants`
SET `participant_identity` = CONCAT('user-', `user_id`);

ALTER TABLE `session_participants`
    ADD CONSTRAINT `UK_session_participants_session_identity`
        UNIQUE (`session_id`, `participant_identity`);

CREATE INDEX `IDX_session_participants_connection_status`
    ON `session_participants` (`session_id`, `connection_status`);

CREATE TABLE `livekit_webhook_events` (
    `event_id` VARCHAR(255) NOT NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `room_name` VARCHAR(255) NOT NULL,
    `participant_identity` VARCHAR(255) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`event_id`)
);

CREATE INDEX `IDX_livekit_webhook_events_received_at`
    ON `livekit_webhook_events` (`received_at`);
