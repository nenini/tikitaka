CREATE TABLE `question_cards` (
    `question_card_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `content` VARCHAR(300) NOT NULL,
    `sensitive` BOOLEAN NOT NULL DEFAULT FALSE,
    `active` BOOLEAN NOT NULL DEFAULT TRUE,
    `display_order` INT NOT NULL,
    CONSTRAINT `UK_question_cards_code` UNIQUE (`code`)
);

CREATE INDEX `IDX_question_cards_active_sensitive`
    ON `question_cards` (`active`, `sensitive`, `display_order`);

INSERT INTO `question_cards`
    (`code`, `category`, `content`, `sensitive`, `active`, `display_order`)
VALUES
    ('HOBBY_01', 'HOBBY', '요즘 가장 즐겨 하는 취미가 있나요?', FALSE, TRUE, 1),
    ('HOBBY_02', 'HOBBY', '시간이 생기면 새로 배워 보고 싶은 것이 있나요?', FALSE, TRUE, 2),
    ('EXERCISE_01', 'EXERCISE', '좋아하거나 꾸준히 하는 운동이 있나요?', FALSE, TRUE, 3),
    ('EXERCISE_02', 'EXERCISE', '산책과 실내 운동 중 어느 쪽을 더 좋아하세요?', FALSE, TRUE, 4),
    ('COOKING_01', 'COOKING', '가장 자신 있게 만들 수 있는 음식은 무엇인가요?', FALSE, TRUE, 5),
    ('COOKING_02', 'COOKING', '최근에 맛있게 먹은 음식이 있나요?', FALSE, TRUE, 6),
    ('MBTI_01', 'MBTI', 'MBTI 설명 중 본인과 가장 잘 맞는 부분은 무엇인가요?', FALSE, TRUE, 7),
    ('MBTI_02', 'MBTI', '계획적인 여행과 즉흥 여행 중 어느 쪽을 선호하세요?', FALSE, TRUE, 8),
    ('PET_01', 'PET', '좋아하는 동물이나 함께 살아 보고 싶은 반려동물이 있나요?', FALSE, TRUE, 9),
    ('PET_02', 'PET', '동물을 좋아하게 된 특별한 계기가 있나요?', FALSE, TRUE, 10),
    ('FAMILY_01', 'FAMILY', '가족과 함께할 때 가장 좋아하는 활동은 무엇인가요?', FALSE, TRUE, 11),
    ('DAILY_01', 'DAILY', '최근 일상에서 소소하게 기뻤던 일이 있나요?', FALSE, TRUE, 12),
    ('TRAVEL_01', 'TRAVEL', '다시 방문하고 싶은 여행지가 있나요?', FALSE, TRUE, 13),
    ('CULTURE_01', 'CULTURE', '최근 재미있게 본 영화나 드라마가 있나요?', FALSE, TRUE, 14),
    ('RELIGION_01', 'RELIGION', '종교가 일상에 어떤 영향을 주나요?', TRUE, FALSE, 15);

CREATE TABLE `silence_events` (
    `event_id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `silence_started_elapsed_ms` BIGINT NOT NULL,
    `detected_elapsed_ms` BIGINT NOT NULL,
    `silence_duration_ms` BIGINT NOT NULL,
    `intervention_stage` VARCHAR(40) NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `version` INT NOT NULL,
    `occurred_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    CONSTRAINT `FK_sessions_TO_silence_events`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `UK_silence_events_episode_stage`
        UNIQUE (`session_id`, `silence_started_elapsed_ms`, `intervention_stage`),
    CONSTRAINT `CK_silence_events_elapsed`
        CHECK (`silence_started_elapsed_ms` >= 0
            AND `detected_elapsed_ms` >= `silence_started_elapsed_ms`
            AND `silence_duration_ms` >= 0),
    CONSTRAINT `CK_silence_events_stage`
        CHECK (`intervention_stage` IN (
            'NONE', 'TOPIC_HINT', 'QUESTION_CARD', 'CONTEXTUAL_QUESTIONS'
        ))
);

CREATE INDEX `IDX_silence_events_session_detected`
    ON `silence_events` (`session_id`, `detected_elapsed_ms`);

CREATE TABLE `question_recommendation_events` (
    `event_id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `target_user_id` BIGINT NOT NULL,
    `deduplication_key` VARCHAR(255) NOT NULL,
    `triggered_elapsed_ms` BIGINT NOT NULL,
    `expires_elapsed_ms` BIGINT NOT NULL,
    `delivery_status` VARCHAR(20) NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `version` INT NOT NULL,
    `context_summary` VARCHAR(1000),
    `occurred_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    `delivered_at` DATETIME(6),
    CONSTRAINT `UK_question_recommendations_deduplication`
        UNIQUE (`deduplication_key`),
    CONSTRAINT `FK_sessions_TO_question_recommendation_events`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_question_recommendation_events`
        FOREIGN KEY (`target_user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_question_recommendation_elapsed`
        CHECK (`triggered_elapsed_ms` >= 0
            AND `expires_elapsed_ms` >= `triggered_elapsed_ms`),
    CONSTRAINT `CK_question_recommendation_status`
        CHECK (`delivery_status` IN ('DELIVERED', 'EXPIRED'))
);

CREATE TABLE `question_recommendation_items` (
    `question_recommendation_item_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `event_id` VARCHAR(100) NOT NULL,
    `sequence_no` INT NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    CONSTRAINT `UK_question_recommendation_sequence`
        UNIQUE (`event_id`, `sequence_no`),
    CONSTRAINT `FK_question_recommendation_events_TO_items`
        FOREIGN KEY (`event_id`)
            REFERENCES `question_recommendation_events` (`event_id`)
);
