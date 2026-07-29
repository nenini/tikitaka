CREATE TABLE `room_device_checks` (
    `roomDeviceCheckId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `sessionId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `cameraPassed` BOOLEAN NOT NULL,
    `microphonePassed` BOOLEAN NOT NULL,
    `speakerPassed` BOOLEAN NOT NULL,
    `networkPassed` BOOLEAN NOT NULL,
    `checkedAt` DATETIME NOT NULL,
    CONSTRAINT `FK_sessions_TO_room_device_checks`
        FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_room_device_checks`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
);

CREATE INDEX `IDX_room_device_checks_latest`
    ON `room_device_checks` (`sessionId`, `userId`, `checkedAt`, `roomDeviceCheckId`);
