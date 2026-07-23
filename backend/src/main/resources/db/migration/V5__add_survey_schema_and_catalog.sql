ALTER TABLE `face_tag_catalog`
    ADD COLUMN `applicableGender` VARCHAR(20) NOT NULL DEFAULT 'ALL';

ALTER TABLE `face_tag_catalog`
    ADD COLUMN `displayOrder` SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE `face_tag_catalog`
    ADD CONSTRAINT `UK_face_tag_catalog_code` UNIQUE (`code`);

ALTER TABLE `face_tag_catalog`
    ADD CONSTRAINT `CK_face_tag_catalog_applicable_gender`
        CHECK (`applicableGender` IN ('ALL', 'MALE', 'FEMALE'));

ALTER TABLE `trait_catalog`
    ADD COLUMN `displayOrder` SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE `trait_catalog`
    ADD CONSTRAINT `UK_trait_catalog_type_code` UNIQUE (`traitType`, `code`);

ALTER TABLE `practice_goal_catalog`
    ADD COLUMN `goalCategory` VARCHAR(30) NOT NULL DEFAULT 'OTHER';

ALTER TABLE `practice_goal_catalog`
    ADD COLUMN `displayOrder` SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE `practice_goal_catalog`
    ADD CONSTRAINT `UK_practice_goal_catalog_code` UNIQUE (`code`);

ALTER TABLE `user_practice_goals`
    ADD COLUMN `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `user_traits`
    ADD COLUMN `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `user_traits`
    ADD CONSTRAINT `UK_user_traits_user_trait` UNIQUE (`userId`, `traitId`);

CREATE TABLE `user_preferred_age_ranges` (
    `userId` BIGINT NOT NULL,
    `minPreferredAge` SMALLINT NOT NULL,
    `maxPreferredAge` SMALLINT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `PK_user_preferred_age_ranges` PRIMARY KEY (`userId`),
    CONSTRAINT `FK_users_TO_user_preferred_age_ranges`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_user_preferred_age_ranges`
        CHECK (`minPreferredAge` > 0 AND `maxPreferredAge` >= `minPreferredAge`)
);

CREATE TABLE `user_preferred_face_tags` (
    `userPreferredFaceTagId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `userId` BIGINT NOT NULL,
    `faceTagId` BIGINT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `UK_user_preferred_face_tags_user` UNIQUE (`userId`),
    CONSTRAINT `FK_users_TO_user_preferred_face_tags`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_face_tag_catalog_TO_user_preferred_face_tags`
        FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`)
);

CREATE TABLE `user_preferred_traits` (
    `userPreferredTraitId` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `userId` BIGINT NOT NULL,
    `traitId` BIGINT NOT NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `UK_user_preferred_traits` UNIQUE (`userId`, `traitId`),
    CONSTRAINT `FK_users_TO_user_preferred_traits`
        FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_trait_catalog_TO_user_preferred_traits`
        FOREIGN KEY (`traitId`) REFERENCES `trait_catalog` (`traitId`)
);

INSERT INTO `face_tag_catalog`
    (`code`, `name`, `description`, `applicableGender`, `displayOrder`)
VALUES
    ('DOG_FACE', '강아지상', NULL, 'ALL', 1),
    ('CAT_FACE', '고양이상', NULL, 'ALL', 2),
    ('RABBIT_FACE', '토끼상', NULL, 'ALL', 3),
    ('DEER_FACE', '사슴상', NULL, 'ALL', 4),
    ('FOX_FACE', '여우상', NULL, 'ALL', 5),
    ('TURTLE_FACE', '거북이상', NULL, 'FEMALE', 6),
    ('HAMSTER_FACE', '햄스터상', NULL, 'FEMALE', 7),
    ('SNAKE_FACE', '뱀상', NULL, 'ALL', 8),
    ('DINOSAUR_FACE', '공룡상', NULL, 'ALL', 9),
    ('WOLF_FACE', '늑대상', NULL, 'MALE', 10);

INSERT INTO `trait_catalog`
    (`traitType`, `code`, `name`, `displayOrder`)
VALUES
    ('PERSONALITY', 'KIND', '다정', 1),
    ('PERSONALITY', 'GENTLE', '온화', 2),
    ('PERSONALITY', 'OPTIMISTIC', '낙천', 3),
    ('PERSONALITY', 'RELAXED', '느긋', 4),
    ('PERSONALITY', 'ALOOF', '도도', 5),
    ('PERSONALITY', 'FRIENDLY', '친근', 6),
    ('PERSONALITY', 'CALM', '차분', 7),
    ('PERSONALITY', 'DELICATE', '섬세', 8),
    ('PERSONALITY', 'HONEST', '솔직', 9),
    ('PERSONALITY', 'POLITE', '예의바른', 10),
    ('PERSONALITY', 'HUMOROUS', '유머러스한', 11);

INSERT INTO `practice_goal_catalog`
    (`code`, `name`, `description`, `goalCategory`, `displayOrder`)
VALUES
    ('TALK_TOO_MUCH', '말이 너무 많아요', NULL, 'SPEECH_AMOUNT', 1),
    ('TALK_TOO_LITTLE', '말이 너무 적어요', NULL, 'SPEECH_AMOUNT', 2),
    ('VOICE_TOO_LOUD', '목소리가 너무 커요', NULL, 'VOICE_VOLUME', 3),
    ('VOICE_TOO_QUIET', '목소리가 너무 작아요', NULL, 'VOICE_VOLUME', 4),
    ('OTHER', '기타', NULL, 'OTHER', 5);
