ALTER TABLE `peer_evaluations` RENAME TO `peer_evaluations_legacy`;

CREATE TABLE `peer_evaluations` (
    `peer_evaluation_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `session_id` BIGINT NOT NULL,
    `evaluator_user_id` BIGINT NOT NULL,
    `evaluatee_user_id` BIGINT NOT NULL,
    `comfort_score` INT NOT NULL,
    `question_connection_score` INT NOT NULL,
    `listening_score` INT NOT NULL,
    `reaction_score` INT NOT NULL,
    `balance_score` INT NOT NULL,
    `manner_score` INT NOT NULL,
    `good_behavior_text` VARCHAR(1000),
    `improvement_text` VARCHAR(1000),
    `submitted_at` DATETIME(6) NOT NULL,
    CONSTRAINT `UK_peer_evaluations_session_evaluator`
        UNIQUE (`session_id`, `evaluator_user_id`),
    CONSTRAINT `FK_sessions_TO_peer_evaluations`
        FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
    CONSTRAINT `FK_evaluator_users_TO_peer_evaluations`
        FOREIGN KEY (`evaluator_user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `FK_evaluatee_users_TO_peer_evaluations`
        FOREIGN KEY (`evaluatee_user_id`) REFERENCES `users` (`userId`),
    CONSTRAINT `CK_peer_evaluations_distinct_users`
        CHECK (`evaluator_user_id` <> `evaluatee_user_id`),
    CONSTRAINT `CK_peer_evaluations_score_range`
        CHECK (
            `comfort_score` BETWEEN 1 AND 5
            AND `question_connection_score` BETWEEN 1 AND 5
            AND `listening_score` BETWEEN 1 AND 5
            AND `reaction_score` BETWEEN 1 AND 5
            AND `balance_score` BETWEEN 1 AND 5
            AND `manner_score` BETWEEN 1 AND 5
        )
);

CREATE INDEX `IDX_peer_evaluations_session`
    ON `peer_evaluations` (`session_id`, `submitted_at`);

ALTER TABLE `sessions`
    ADD COLUMN `evaluation_completion_notified_at` DATETIME(6) NULL;
