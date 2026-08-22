-- Compare cooldown query alternatives without changing application code.
SET @source_user_id = 10001;
SET @now = NOW();
SET SESSION group_concat_max_len = 1000000;

SELECT GROUP_CONCAT(userId ORDER BY userId)
INTO @candidate_user_ids
FROM active_match_requests
WHERE userId BETWEEN 10002 AND 20000;

-- Existing result set.
DROP TEMPORARY TABLE IF EXISTS baseline_cooldown;
CREATE TEMPORARY TABLE baseline_cooldown (
    candidateUserId BIGINT NOT NULL PRIMARY KEY
);

SET @baseline_insert_sql = CONCAT(
    'INSERT INTO baseline_cooldown ',
    'SELECT DISTINCT CASE WHEN userAId = ', @source_user_id,
    ' THEN userBId ELSE userAId END FROM match_pairs WHERE ',
    '((userAId = ', @source_user_id, ' AND userBId IN (',
    @candidate_user_ids, ')) OR (userBId = ', @source_user_id,
    ' AND userAId IN (', @candidate_user_ids, '))) AND ',
    "((status IN ('COMPLETED', 'CANCELLED', 'REJECTED') ",
    "AND COALESCE(completedAt, closedAt, cancelledAt) <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    'AND TIMESTAMPADD(DAY, recentMatchExclusionDaysSnapshot, ',
    "COALESCE(completedAt, closedAt, cancelledAt)) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "') ",
    "OR (status = 'EXPIRED' AND closedAt <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    "AND TIMESTAMPADD(HOUR, 24, closedAt) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "'))"
);
PREPARE baseline_insert_statement FROM @baseline_insert_sql;
EXECUTE baseline_insert_statement;
DEALLOCATE PREPARE baseline_insert_statement;

-- Alternative A: split directions but retain candidate IN filtering.
DROP TEMPORARY TABLE IF EXISTS union_with_candidates;
CREATE TEMPORARY TABLE union_with_candidates (
    candidateUserId BIGINT NOT NULL PRIMARY KEY
);

SET @union_insert_sql = CONCAT(
    'INSERT IGNORE INTO union_with_candidates ',
    'SELECT userBId FROM match_pairs WHERE userAId = ', @source_user_id,
    ' AND userBId IN (', @candidate_user_ids, ') AND ',
    "((status IN ('COMPLETED', 'CANCELLED', 'REJECTED') ",
    "AND COALESCE(completedAt, closedAt, cancelledAt) <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    'AND TIMESTAMPADD(DAY, recentMatchExclusionDaysSnapshot, ',
    "COALESCE(completedAt, closedAt, cancelledAt)) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "') ",
    "OR (status = 'EXPIRED' AND closedAt <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    "AND TIMESTAMPADD(HOUR, 24, closedAt) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "')) ",
    'UNION ALL SELECT userAId FROM match_pairs WHERE userBId = ',
    @source_user_id, ' AND userAId IN (', @candidate_user_ids, ') AND ',
    "((status IN ('COMPLETED', 'CANCELLED', 'REJECTED') ",
    "AND COALESCE(completedAt, closedAt, cancelledAt) <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    'AND TIMESTAMPADD(DAY, recentMatchExclusionDaysSnapshot, ',
    "COALESCE(completedAt, closedAt, cancelledAt)) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "') ",
    "OR (status = 'EXPIRED' AND closedAt <= '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "' ",
    "AND TIMESTAMPADD(HOUR, 24, closedAt) > '",
    DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'), "'))"
);
PREPARE union_insert_statement FROM @union_insert_sql;
EXECUTE union_insert_statement;
DEALLOCATE PREPARE union_insert_statement;

-- Alternative B: source equality alone narrows history; Java's Set and candidate
-- filtering still restrict the final matching candidates.
DROP TEMPORARY TABLE IF EXISTS union_by_source;
CREATE TEMPORARY TABLE union_by_source (
    candidateUserId BIGINT NOT NULL PRIMARY KEY
);

INSERT IGNORE INTO union_by_source
SELECT userBId
FROM match_pairs
WHERE userAId = @source_user_id
  AND (
      (status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
       AND COALESCE(completedAt, closedAt, cancelledAt) <= @now
       AND TIMESTAMPADD(
               DAY,
               recentMatchExclusionDaysSnapshot,
               COALESCE(completedAt, closedAt, cancelledAt)
           ) > @now)
      OR (status = 'EXPIRED'
          AND closedAt <= @now
          AND TIMESTAMPADD(HOUR, 24, closedAt) > @now)
  )
UNION ALL
SELECT userAId
FROM match_pairs
WHERE userBId = @source_user_id
  AND (
      (status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
       AND COALESCE(completedAt, closedAt, cancelledAt) <= @now
       AND TIMESTAMPADD(
               DAY,
               recentMatchExclusionDaysSnapshot,
               COALESCE(completedAt, closedAt, cancelledAt)
           ) > @now)
      OR (status = 'EXPIRED'
          AND closedAt <= @now
          AND TIMESTAMPADD(HOUR, 24, closedAt) > @now)
  );

-- Set equivalence. Every difference count must be zero.
SELECT 'baseline_count' AS metric, COUNT(*) AS value FROM baseline_cooldown;
SELECT 'union_with_candidates_count' AS metric, COUNT(*) AS value
FROM union_with_candidates;
SELECT 'union_by_source_count' AS metric, COUNT(*) AS value FROM union_by_source;
SELECT 'baseline_minus_union_with_candidates' AS metric, COUNT(*) AS value
FROM baseline_cooldown baseline
LEFT JOIN union_with_candidates candidate USING (candidateUserId)
WHERE candidate.candidateUserId IS NULL;
SELECT 'union_with_candidates_minus_baseline' AS metric, COUNT(*) AS value
FROM union_with_candidates candidate
LEFT JOIN baseline_cooldown baseline USING (candidateUserId)
WHERE baseline.candidateUserId IS NULL;
SELECT 'baseline_minus_union_by_source' AS metric, COUNT(*) AS value
FROM baseline_cooldown baseline
LEFT JOIN union_by_source candidate USING (candidateUserId)
WHERE candidate.candidateUserId IS NULL;
SELECT 'union_by_source_minus_baseline_candidates' AS metric, COUNT(*) AS value
FROM union_by_source candidate
JOIN active_match_requests active ON active.userId = candidate.candidateUserId
LEFT JOIN baseline_cooldown baseline USING (candidateUserId)
WHERE baseline.candidateUserId IS NULL;

-- Plans for both alternatives.
SET @union_explain_sql = REPLACE(
    @union_insert_sql,
    'INSERT IGNORE INTO union_with_candidates ',
    'EXPLAIN ANALYZE '
);
PREPARE union_explain_statement FROM @union_explain_sql;
EXECUTE union_explain_statement;
DEALLOCATE PREPARE union_explain_statement;

EXPLAIN ANALYZE
SELECT userBId AS candidateUserId
FROM match_pairs
WHERE userAId = @source_user_id
  AND (
      (status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
       AND COALESCE(completedAt, closedAt, cancelledAt) <= @now
       AND TIMESTAMPADD(
               DAY,
               recentMatchExclusionDaysSnapshot,
               COALESCE(completedAt, closedAt, cancelledAt)
           ) > @now)
      OR (status = 'EXPIRED'
          AND closedAt <= @now
          AND TIMESTAMPADD(HOUR, 24, closedAt) > @now)
  )
UNION ALL
SELECT userAId AS candidateUserId
FROM match_pairs
WHERE userBId = @source_user_id
  AND (
      (status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
       AND COALESCE(completedAt, closedAt, cancelledAt) <= @now
       AND TIMESTAMPADD(
               DAY,
               recentMatchExclusionDaysSnapshot,
               COALESCE(completedAt, closedAt, cancelledAt)
           ) > @now)
      OR (status = 'EXPIRED'
          AND closedAt <= @now
          AND TIMESTAMPADD(HOUR, 24, closedAt) > @now)
  );
