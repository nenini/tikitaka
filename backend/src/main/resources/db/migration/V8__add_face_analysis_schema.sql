UPDATE `face_tag_catalog` SET `code` = 'DOG' WHERE `code` = 'DOG_FACE';
UPDATE `face_tag_catalog` SET `code` = 'CAT' WHERE `code` = 'CAT_FACE';
UPDATE `face_tag_catalog` SET `code` = 'RABBIT' WHERE `code` = 'RABBIT_FACE';
UPDATE `face_tag_catalog` SET `code` = 'FOX' WHERE `code` = 'FOX_FACE';
UPDATE `face_tag_catalog` SET `code` = 'DEER' WHERE `code` = 'DEER_FACE';
UPDATE `face_tag_catalog`
SET `code` = 'TURTLE', `name` = '꼬북이상'
WHERE `code` = 'TURTLE_FACE';
UPDATE `face_tag_catalog` SET `code` = 'HAMSTER' WHERE `code` = 'HAMSTER_FACE';
UPDATE `face_tag_catalog` SET `code` = 'SNAKE' WHERE `code` = 'SNAKE_FACE';
UPDATE `face_tag_catalog` SET `code` = 'DINOSAUR' WHERE `code` = 'DINOSAUR_FACE';
UPDATE `face_tag_catalog` SET `code` = 'WOLF' WHERE `code` = 'WOLF_FACE';

CREATE TABLE `face_analysis_requests` (
    `analysisRequestId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `userId` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `failureCode` VARCHAR(50) NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expiresAt` DATETIME NOT NULL,
    `completedAt` DATETIME NULL,
    `failedAt` DATETIME NULL,
    CONSTRAINT `FK_users_TO_face_analysis_requests`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_face_analysis_requests_status`
        CHECK (`status` IN ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED')),
    CONSTRAINT `CK_face_analysis_requests_failure_code`
        CHECK (
            `failureCode` IS NULL OR `failureCode` IN (
                'NO_FACE',
                'MULTIPLE_FACES',
                'LOW_LIGHT',
                'OVEREXPOSED',
                'SEVERE_BLUR',
                'EXTREME_HEAD_POSE',
                'INVALID_IMAGE'
            )
        ),
    CONSTRAINT `CK_face_analysis_requests_completed`
        CHECK (
            (`status` = 'COMPLETED' AND `completedAt` IS NOT NULL)
            OR (`status` <> 'COMPLETED' AND `completedAt` IS NULL)
        ),
    CONSTRAINT `CK_face_analysis_requests_failed`
        CHECK (
            (
                `status` = 'FAILED'
                AND `failureCode` IS NOT NULL
                AND `failedAt` IS NOT NULL
            )
            OR (
                `status` <> 'FAILED'
                AND `failureCode` IS NULL
                AND `failedAt` IS NULL
            )
        )
);

CREATE INDEX `IDX_face_analysis_requests_user_status`
    ON `face_analysis_requests` (`userId`, `status`);

CREATE INDEX `IDX_face_analysis_requests_status_expires`
    ON `face_analysis_requests` (`status`, `expiresAt`);

CREATE TABLE `face_analysis_results` (
    `faceAnalysisResultId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `analysisRequestId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `primaryFaceTagId` BIGINT NOT NULL,
    `modelVersion` VARCHAR(100) NOT NULL,
    `analyzedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `UK_face_analysis_results_request` UNIQUE (`analysisRequestId`),
    CONSTRAINT `FK_face_analysis_requests_TO_results`
        FOREIGN KEY (`analysisRequestId`)
            REFERENCES `face_analysis_requests` (`analysisRequestId`),
    CONSTRAINT `FK_users_TO_face_analysis_results`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_face_tag_catalog_TO_face_analysis_results`
        FOREIGN KEY (`primaryFaceTagId`)
            REFERENCES `face_tag_catalog` (`face_tag_id`)
);

CREATE INDEX `IDX_face_analysis_results_user_analyzed`
    ON `face_analysis_results` (`userId`, `analyzedAt`);

CREATE TABLE `face_analysis_result_tags` (
    `faceAnalysisResultTagId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `faceAnalysisResultId` BIGINT NOT NULL,
    `faceTagId` BIGINT NOT NULL,
    `relativeScore` DECIMAL(8, 6) NOT NULL,
    `rankOrder` SMALLINT NOT NULL,
    CONSTRAINT `UK_face_analysis_result_tags_face_tag`
        UNIQUE (`faceAnalysisResultId`, `faceTagId`),
    CONSTRAINT `UK_face_analysis_result_tags_rank`
        UNIQUE (`faceAnalysisResultId`, `rankOrder`),
    CONSTRAINT `FK_face_analysis_results_TO_tags`
        FOREIGN KEY (`faceAnalysisResultId`)
            REFERENCES `face_analysis_results` (`faceAnalysisResultId`),
    CONSTRAINT `FK_face_tag_catalog_TO_face_analysis_result_tags`
        FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
    CONSTRAINT `CK_face_analysis_result_tags_score`
        CHECK (`relativeScore` >= 0 AND `relativeScore` <= 1),
    CONSTRAINT `CK_face_analysis_result_tags_rank`
        CHECK (`rankOrder` > 0)
);

ALTER TABLE `user_face_tags`
    RENAME COLUMN `confidenceScore` TO `relativeScore`;

ALTER TABLE `user_face_tags`
    MODIFY COLUMN `relativeScore` DECIMAL(8, 6) NULL;

ALTER TABLE `user_face_tags`
    ADD COLUMN `faceAnalysisResultId` BIGINT NULL;

ALTER TABLE `user_face_tags`
    ADD CONSTRAINT `UK_user_face_tags_user_face_tag`
        UNIQUE (`userId`, `faceTagId`);

ALTER TABLE `user_face_tags`
    ADD CONSTRAINT `UK_user_face_tags_user_rank`
        UNIQUE (`userId`, `rankOrder`);

ALTER TABLE `user_face_tags`
    ADD CONSTRAINT `FK_face_analysis_results_TO_user_face_tags`
        FOREIGN KEY (`faceAnalysisResultId`)
            REFERENCES `face_analysis_results` (`faceAnalysisResultId`);

ALTER TABLE `user_face_tags`
    ADD CONSTRAINT `CK_user_face_tags_score`
        CHECK (
            `relativeScore` IS NULL
            OR (`relativeScore` >= 0 AND `relativeScore` <= 1)
        );

ALTER TABLE `user_face_tags`
    ADD CONSTRAINT `CK_user_face_tags_rank`
        CHECK (`rankOrder` > 0);
