CREATE TABLE `mission_catalog` (
    `mission_id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(60) NOT NULL,
    `practice_goal_code` VARCHAR(50) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `target_value` INT NOT NULL,
    `progress_unit` VARCHAR(20) NOT NULL,
    `display_order` SMALLINT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (`mission_id`),
    CONSTRAINT `UK_mission_catalog_code` UNIQUE (`code`),
    CONSTRAINT `FK_mission_catalog_practice_goal_code`
        FOREIGN KEY (`practice_goal_code`)
        REFERENCES `practice_goal_catalog` (`code`),
    CONSTRAINT `CK_mission_catalog_target_value`
        CHECK (`target_value` > 0)
);

CREATE TABLE `session_missions` (
    `session_mission_id` BIGINT NOT NULL AUTO_INCREMENT,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `mission_id` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    `progress_value` INT NOT NULL DEFAULT 0,
    `target_value` INT NOT NULL,
    `assigned_at` DATETIME(6) NOT NULL,
    `completed_at` DATETIME(6) NULL,
    `updated_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`session_mission_id`),
    CONSTRAINT `UK_session_missions_session_user_mission`
        UNIQUE (`session_id`, `user_id`, `mission_id`),
    CONSTRAINT `FK_session_missions_session`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_session_missions_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_session_missions_mission`
        FOREIGN KEY (`mission_id`) REFERENCES `mission_catalog` (`mission_id`),
    CONSTRAINT `CK_session_missions_progress_value`
        CHECK (`progress_value` >= 0),
    CONSTRAINT `CK_session_missions_target_value`
        CHECK (`target_value` > 0)
);

CREATE INDEX `IDX_mission_catalog_goal_active`
    ON `mission_catalog`
        (`practice_goal_code`, `is_active`, `display_order`);

CREATE INDEX `IDX_session_missions_user_status`
    ON `session_missions` (`session_id`, `user_id`, `status`);

INSERT INTO `mission_catalog`
    (
        `code`,
        `practice_goal_code`,
        `title`,
        `description`,
        `target_value`,
        `progress_unit`,
        `display_order`
    )
VALUES
    (
        'ASK_FOLLOW_UP_QUESTION',
        'TALK_TOO_LITTLE',
        '확장 질문 1회 하기',
        '상대방의 이야기를 듣고 관련된 질문을 한 번 더 해보세요.',
        1,
        'COUNT',
        1
    ),
    (
        'LISTEN_WITHOUT_INTERRUPT',
        'TALK_TOO_MUCH',
        '상대의 이야기 끝까지 듣기',
        '상대방의 말을 끊지 않고 끝까지 들어보세요.',
        1,
        'COUNT',
        2
    ),
    (
        'KEEP_COMFORTABLE_VOLUME_LOWER',
        'VOICE_TOO_LOUD',
        '편안한 성량 유지하기',
        '상대방이 편안하게 들을 수 있도록 목소리를 조금 낮춰보세요.',
        60,
        'SECONDS',
        3
    ),
    (
        'KEEP_COMFORTABLE_VOLUME_HIGHER',
        'VOICE_TOO_QUIET',
        '또렷한 성량 유지하기',
        '상대방에게 잘 들리도록 또렷한 목소리를 유지해보세요.',
        60,
        'SECONDS',
        4
    );
