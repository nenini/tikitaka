ALTER TABLE `sessions`
	ADD COLUMN `endedByUserId` BIGINT NULL;

CREATE INDEX `IX_SESSIONS_ENDED_BY_USER`
	ON `sessions` (`endedByUserId`);
