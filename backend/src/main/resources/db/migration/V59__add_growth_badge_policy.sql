ALTER TABLE badge_catalog
    ADD COLUMN policyVersion VARCHAR(50) NOT NULL DEFAULT 'badge-v1.0.0';
ALTER TABLE badge_catalog
    ADD CONSTRAINT uk_badge_catalog_code UNIQUE (code);

ALTER TABLE user_badges
    ADD COLUMN awardPolicyVersion VARCHAR(50) NOT NULL DEFAULT 'badge-v1.0.0';
DELETE FROM user_badges
WHERE userBadgeId NOT IN (
    SELECT keepId FROM (
        SELECT MIN(userBadgeId) AS keepId
        FROM user_badges
        GROUP BY userId, badgeId
    ) deduplicated
);
ALTER TABLE user_badges
    ADD CONSTRAINT uk_user_badges_user_badge UNIQUE (userId, badgeId);

INSERT INTO badge_catalog
    (code, name, description, conditionType, thresholdCount, iconUrl, isActive, createdAt, updatedAt, displayOrder, policyVersion)
VALUES
    ('FIRST_SESSION', '첫 만남', '첫 번째 소개팅 연습 세션을 완료했어요.', 'SESSION_COMPLETED_COUNT', 1, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 10, 'badge-v1.0.0'),
    ('SESSION_5', '대화 입문자', '소개팅 연습 세션을 5회 완료했어요.', 'SESSION_COMPLETED_COUNT', 5, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 20, 'badge-v1.0.0'),
    ('SESSION_10', '대화 연습가', '소개팅 연습 세션을 10회 완료했어요.', 'SESSION_COMPLETED_COUNT', 10, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 30, 'badge-v1.0.0'),
    ('FIRST_REPORT', '첫 번째 피드백', '첫 번째 AI 분석 리포트를 받았어요.', 'REPORT_COMPLETED_COUNT', 1, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 40, 'badge-v1.0.0'),
    ('REPORT_5', '성장 기록가', 'AI 분석 리포트를 5회 받았어요.', 'REPORT_COMPLETED_COUNT', 5, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 50, 'badge-v1.0.0')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    conditionType = VALUES(conditionType),
    thresholdCount = VALUES(thresholdCount),
    updatedAt = CURRENT_TIMESTAMP,
    policyVersion = VALUES(policyVersion);
