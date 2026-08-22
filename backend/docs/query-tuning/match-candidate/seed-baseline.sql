-- MATCH candidate query-tuning baseline dataset (MySQL 8.4)
-- Synthetic IDs start at 10001 so local-profile fixtures remain untouched.

SET SESSION cte_max_recursion_depth = 200000;
SET @face_tag_id = (SELECT MIN(face_tag_id) FROM face_tag_catalog);

INSERT INTO users (
    userId, email, passwordHash, realName, birthDate,
    accountStatus, role, adultVerifiedAt, createdAt, updatedAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT
    10000 + n,
    CONCAT('perf-user-', n, '@example.com'),
    '$2a$10$benchmark.only.not.for.authentication',
    CONCAT('성능테스트', n),
    DATE_ADD('1990-01-01', INTERVAL MOD(n, 3650) DAY),
    'ACTIVE', 'USER', NOW(), NOW(), NOW()
FROM seq;

INSERT INTO user_profiles (
    userId, nickname, gender, regionCity,
    onboardingCompleted, createdAt, updatedAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT
    10000 + n,
    CONCAT('perf', n),
    IF(MOD(n, 2) = 0, 'MALE', 'FEMALE'),
    '서울', TRUE, NOW(), NOW()
FROM seq;

INSERT INTO match_requests (
    matchRequestId, userId, status,
    preferredAgeMin, preferredAgeMax,
    preferredFaceTagId, actualFaceTagId,
    requestedAt, updatedAt, waitingStartedAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT
    10000 + n,
    10000 + n,
    'WAITING',
    20, 45,
    @face_tag_id, @face_tag_id,
    TIMESTAMPADD(SECOND, -n, NOW()),
    NOW(),
    TIMESTAMPADD(SECOND, -n, NOW())
FROM seq;

INSERT INTO active_match_requests (userId, matchRequestId, createdAt)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 10000
)
SELECT 10000 + n, 10000 + n, NOW()
FROM seq;

-- 1,000 bidirectional block relations involving the source user (10001).
INSERT INTO user_blocks (blockerUserId, blockedUserId, reason, createdAt)
WITH RECURSIVE seq(n) AS (
    SELECT 2
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 1001
)
SELECT
    IF(MOD(n, 2) = 0, 10001, 10000 + n),
    IF(MOD(n, 2) = 0, 10000 + n, 10001),
    'query-tuning fixture', NOW()
FROM seq;

-- 500 currently restricted candidates.
INSERT INTO sanctions (
    userId, sanctionType, reason, startsAt, endsAt, createdAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 2002
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 2501
)
SELECT
    10000 + n,
    'TEMPORARY_BAN',
    'query-tuning fixture',
    TIMESTAMPADD(DAY, -1, NOW()),
    TIMESTAMPADD(DAY, 1, NOW()),
    NOW()
FROM seq;

-- 2,000 recent closed pairs create cooldown exclusions for the source user.
INSERT INTO match_pairs (
    requesterAId, requesterBId, userAId, userBId,
    faceScore, traitScore, totalScore,
    status, acceptDeadlineAt, matchedAt, proposedScheduledAt,
    policyVersion, lateCancellationMinutesSnapshot,
    recentMatchExclusionDaysSnapshot, closedAt, completedAt, updatedAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 3002
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 5001
)
SELECT
    10001, 10000 + n,
    10001, 10000 + n,
    25, 25, 50,
    'COMPLETED',
    TIMESTAMPADD(DAY, -2, NOW()),
    TIMESTAMPADD(DAY, -2, NOW()),
    TIMESTAMPADD(DAY, -2, NOW()),
    1, 60, 7,
    TIMESTAMPADD(DAY, -2, NOW()),
    TIMESTAMPADD(DAY, -2, NOW()),
    NOW()
FROM seq;

-- 100,000 unrelated block relations prevent a tiny-table plan from hiding
-- whether the bidirectional OR predicate can use both directional indexes.
INSERT INTO user_blocks (blockerUserId, blockedUserId, reason, createdAt)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 100000
)
SELECT
    10002 + FLOOR((n - 1) / 20),
    15002 + MOD(n - 1, 4999),
    'query-tuning background fixture', NOW()
FROM seq;

-- 100,000 unrelated historical pairs expose full scans in the cooldown query.
INSERT INTO match_pairs (
    requesterAId, requesterBId, userAId, userBId,
    faceScore, traitScore, totalScore,
    status, acceptDeadlineAt, matchedAt, proposedScheduledAt,
    policyVersion, lateCancellationMinutesSnapshot,
    recentMatchExclusionDaysSnapshot, closedAt, completedAt, updatedAt
)
WITH RECURSIVE seq(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 100000
)
SELECT
    10002 + FLOOR((n - 1) / 100),
    15002 + MOD(n - 1, 4999),
    10002 + FLOOR((n - 1) / 100),
    15002 + MOD(n - 1, 4999),
    25, 25, 50,
    'COMPLETED',
    TIMESTAMPADD(DAY, -30, NOW()),
    TIMESTAMPADD(DAY, -30, NOW()),
    TIMESTAMPADD(DAY, -30, NOW()),
    1, 60, 7,
    TIMESTAMPADD(DAY, -30, NOW()),
    TIMESTAMPADD(DAY, -30, NOW()),
    NOW()
FROM seq;

ANALYZE TABLE users, user_profiles, match_requests, active_match_requests,
    user_blocks, sanctions, match_pairs;

SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'match_requests', COUNT(*) FROM match_requests
UNION ALL SELECT 'active_match_requests', COUNT(*) FROM active_match_requests
UNION ALL SELECT 'user_blocks', COUNT(*) FROM user_blocks
UNION ALL SELECT 'sanctions', COUNT(*) FROM sanctions
UNION ALL SELECT 'match_pairs', COUNT(*) FROM match_pairs;
