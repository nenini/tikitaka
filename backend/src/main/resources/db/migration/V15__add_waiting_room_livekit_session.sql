ALTER TABLE `sessions`
    ADD COLUMN `livekitRoomName` VARCHAR(255) NULL;

ALTER TABLE `sessions`
    ADD CONSTRAINT `UK_sessions_match_pair` UNIQUE (`matchPairId`);

ALTER TABLE `sessions`
    ADD CONSTRAINT `UK_sessions_livekit_room_name` UNIQUE (`livekitRoomName`);

ALTER TABLE `session_participants`
    ADD CONSTRAINT `UK_session_participants_session_user`
        UNIQUE (`session_id`, `user_id`);

INSERT INTO `sessions` (
    `matchPairId`,
    `sessionType`,
    `status`,
    `scheduledStartAt`,
    `plannedDurationSec`,
    `extensionDurationSec`,
    `livekitRoomName`
)
SELECT
    pair.`matchPairId`,
    'REAL_DATE',
    'SCHEDULED',
    pair.`scheduledAt`,
    1800,
    0,
    CONCAT('date-room-', pair.`matchPairId`)
FROM `match_pairs` pair
WHERE pair.`status` = 'CONFIRMED'
  AND pair.`scheduledAt` IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM `sessions` session
      WHERE session.`matchPairId` = pair.`matchPairId`
  );

INSERT INTO `session_participants` (
    `session_id`,
    `user_id`,
    `participant_role`,
    `participation_status`
)
SELECT session.`sessionId`, pair.`userAId`, 'A', 'WAITING'
FROM `sessions` session
JOIN `match_pairs` pair ON pair.`matchPairId` = session.`matchPairId`
WHERE NOT EXISTS (
    SELECT 1
    FROM `session_participants` participant
    WHERE participant.`session_id` = session.`sessionId`
      AND participant.`user_id` = pair.`userAId`
);

INSERT INTO `session_participants` (
    `session_id`,
    `user_id`,
    `participant_role`,
    `participation_status`
)
SELECT session.`sessionId`, pair.`userBId`, 'B', 'WAITING'
FROM `sessions` session
JOIN `match_pairs` pair ON pair.`matchPairId` = session.`matchPairId`
WHERE NOT EXISTS (
    SELECT 1
    FROM `session_participants` participant
    WHERE participant.`session_id` = session.`sessionId`
      AND participant.`user_id` = pair.`userBId`
);
