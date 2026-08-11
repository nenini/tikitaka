-- V1의 safety_events는 초기 설계안이며 아직 애플리케이션에서 사용하지 않는다.
-- 기존 데이터를 보존한 채 AI 이벤트 계약용 스키마로 교체한다.
ALTER TABLE `safety_events` RENAME TO `safety_events_legacy`;

CREATE TABLE `safety_events` (
    `event_id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `ai_severity` VARCHAR(20) NOT NULL,
    `effective_severity` VARCHAR(20) NOT NULL,
    `occurrence_count` INT NOT NULL,
    `manner_penalty_score` INT NOT NULL,
    `reason_code` VARCHAR(100) NOT NULL,
    `warning_message` VARCHAR(500) NOT NULL,
    `confidence` DECIMAL(6, 5),
    `deduplication_key` VARCHAR(255) NOT NULL,
    `session_elapsed_ms` BIGINT NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `version` INT NOT NULL,
    `occurred_at` DATETIME(6) NOT NULL,
    `received_at` DATETIME(6) NOT NULL,
    `warning_delivered_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_safety_events_deduplication`
        UNIQUE (`deduplication_key`),
    CONSTRAINT `FK_sessions_TO_safety_events`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_users_TO_safety_events`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_safety_events_severity`
        CHECK (`ai_severity` IN ('LOW', 'MEDIUM', 'HIGH')
            AND `effective_severity` IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT `CK_safety_events_values`
        CHECK (`occurrence_count` > 0
            AND `manner_penalty_score` >= 0
            AND `session_elapsed_ms` >= 0
            AND `version` > 0),
    CONSTRAINT `CK_safety_events_confidence`
        CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1))
);

CREATE INDEX `IDX_safety_events_repeat_policy`
    ON `safety_events` (`session_id`, `user_id`, `category`, `occurred_at`);

CREATE INDEX `IDX_safety_events_report`
    ON `safety_events` (`session_id`, `effective_severity`, `session_elapsed_ms`);
