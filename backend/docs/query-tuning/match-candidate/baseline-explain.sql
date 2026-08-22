-- Baseline plans for SQL issued by MatchCandidateService.
SET @source_user_id = 10001;
SET @now = NOW();
SET SESSION group_concat_max_len = 1000000;
SELECT GROUP_CONCAT(userId ORDER BY userId)
INTO @candidate_user_ids
FROM active_match_requests
WHERE userId BETWEEN 10002 AND 20000;

EXPLAIN ANALYZE
SELECT request.*
FROM match_requests request
WHERE request.status = 'WAITING'
ORDER BY request.requestedAt, request.matchRequestId;

SET @block_sql = CONCAT(
    'EXPLAIN ANALYZE SELECT CASE ',
    'WHEN blockerUserId = ', @source_user_id, ' THEN blockedUserId ',
    'ELSE blockerUserId END AS candidateUserId ',
    'FROM user_blocks WHERE (blockerUserId = ', @source_user_id,
    ' AND blockedUserId IN (', @candidate_user_ids, ')) ',
    'OR (blockedUserId = ', @source_user_id,
    ' AND blockerUserId IN (', @candidate_user_ids, '))'
);
PREPARE block_statement FROM @block_sql;
EXECUTE block_statement;
DEALLOCATE PREPARE block_statement;

SET @cooldown_sql = CONCAT(
    'EXPLAIN ANALYZE SELECT DISTINCT CASE ',
    'WHEN userAId = ', @source_user_id, ' THEN userBId ELSE userAId END ',
    'AS candidateUserId FROM match_pairs WHERE ',
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
PREPARE cooldown_statement FROM @cooldown_sql;
EXECUTE cooldown_statement;
DEALLOCATE PREPARE cooldown_statement;

EXPLAIN ANALYZE
SELECT DISTINCT userId
FROM sanctions
WHERE userId BETWEEN 10001 AND 20000
  AND startsAt <= @now
  AND (endsAt IS NULL OR endsAt > @now);

EXPLAIN ANALYZE
SELECT pair.*
FROM match_pairs pair
WHERE pair.status IN ('PENDING_ACCEPTANCE', 'CONFIRMED')
  AND (pair.userAId BETWEEN 10001 AND 20000
       OR pair.userBId BETWEEN 10001 AND 20000);
