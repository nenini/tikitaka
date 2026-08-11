ALTER TABLE `sessions`
    ADD COLUMN `ending_soon_notified_at` DATETIME(6) NULL;

ALTER TABLE `sessions`
    ADD COLUMN `ending_imminent_notified_at` DATETIME(6) NULL;

ALTER TABLE `sessions`
    ADD COLUMN `timer_expired_notified_at` DATETIME(6) NULL;

CREATE INDEX `IDX_sessions_active_timer`
    ON `sessions` (`status`, `timer_expired_notified_at`);
