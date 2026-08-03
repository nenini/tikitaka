ALTER TABLE `attendance_penalties`
    ADD CONSTRAINT `UK_attendance_penalties_session_user_type`
        UNIQUE (`sessionId`, `userId`, `penaltyType`);

CREATE INDEX `IDX_attendance_penalties_user_type`
    ON `attendance_penalties` (`userId`, `penaltyType`, `createdAt`);

CREATE INDEX `IDX_sanctions_user_active`
    ON `sanctions` (`userId`, `sanctionType`, `startsAt`, `endsAt`);
