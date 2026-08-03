ALTER TABLE `sessions`
    ALTER COLUMN `plannedDurationSec` SET DEFAULT 2100;

UPDATE `sessions`
SET `plannedDurationSec` = 2100
WHERE `plannedDurationSec` = 1800
  AND `status` IN ('CREATED', 'SCHEDULED', 'WAITING', 'READY');

ALTER TABLE `contact_exchange_requests`
    ADD CONSTRAINT `UK_contact_exchange_requests_session`
        UNIQUE (`sessionId`);
