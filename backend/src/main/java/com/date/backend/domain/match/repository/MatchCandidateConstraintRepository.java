package com.date.backend.domain.match.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.time.LocalDateTime;

@Repository
public class MatchCandidateConstraintRepository {

	private final NamedParameterJdbcTemplate jdbcTemplate;

	public MatchCandidateConstraintRepository(NamedParameterJdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public Set<Long> findBlockedCandidateUserIds(
			Long sourceUserId,
			Collection<Long> candidateUserIds
	) {
		if (candidateUserIds.isEmpty()) {
			return Set.of();
		}
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("sourceUserId", sourceUserId)
				.addValue("candidateUserIds", candidateUserIds);
		return new HashSet<>(jdbcTemplate.queryForList("""
				SELECT CASE
					WHEN blockerUserId = :sourceUserId THEN blockedUserId
					ELSE blockerUserId
				END AS candidateUserId
				FROM user_blocks
				WHERE (
					blockerUserId = :sourceUserId
					AND blockedUserId IN (:candidateUserIds)
				) OR (
					blockedUserId = :sourceUserId
					AND blockerUserId IN (:candidateUserIds)
				)
				""", parameters, Long.class));
	}

	public boolean areUsersBlocked(Long firstUserId, Long secondUserId) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("firstUserId", firstUserId)
				.addValue("secondUserId", secondUserId);
		Integer count = jdbcTemplate.queryForObject("""
				SELECT COUNT(*)
				FROM user_blocks
				WHERE (
					blockerUserId = :firstUserId
					AND blockedUserId = :secondUserId
				) OR (
					blockerUserId = :secondUserId
					AND blockedUserId = :firstUserId
				)
				""", parameters, Integer.class);
		return count != null && count > 0;
	}

	public Set<Long> findRestrictedUserIds(Collection<Long> userIds, LocalDateTime now) {
		if (userIds.isEmpty()) return Set.of();
		MapSqlParameterSource parameters = new MapSqlParameterSource()
				.addValue("userIds", userIds)
				.addValue("now", now);
		return new HashSet<>(jdbcTemplate.queryForList("""
				SELECT DISTINCT userId FROM sanctions
				WHERE userId IN (:userIds)
				AND startsAt <= :now
				AND (endsAt IS NULL OR endsAt > :now)
				""", parameters, Long.class));
	}

	public Set<Long> findCooldownCandidateUserIds(
			Long sourceUserId,
			Collection<Long> candidateUserIds,
			LocalDateTime now
	) {
		if (candidateUserIds.isEmpty()) {
			return Set.of();
		}
		MapSqlParameterSource parameters = cooldownParameters(
				sourceUserId,
				null,
				now
		).addValue("candidateUserIds", candidateUserIds);
		return new HashSet<>(jdbcTemplate.queryForList("""
				SELECT DISTINCT CASE
					WHEN userAId = :sourceUserId THEN userBId
					ELSE userAId
				END AS candidateUserId
				FROM match_pairs
				WHERE (
					(userAId = :sourceUserId AND userBId IN (:candidateUserIds))
					OR (userBId = :sourceUserId AND userAId IN (:candidateUserIds))
				)
				AND (
					(status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
						AND COALESCE(completedAt, closedAt, cancelledAt) <= :now
						AND TIMESTAMPADD(
							DAY,
							recentMatchExclusionDaysSnapshot,
							COALESCE(completedAt, closedAt, cancelledAt)
						) > :now)
					OR (status = 'EXPIRED'
						AND closedAt <= :now
						AND TIMESTAMPADD(HOUR, 24, closedAt) > :now)
				)
				""", parameters, Long.class));
	}

	public boolean areUsersInCooldown(
			Long firstUserId,
			Long secondUserId,
			LocalDateTime now
	) {
		MapSqlParameterSource parameters = cooldownParameters(
				firstUserId,
				secondUserId,
				now
		);
		Integer count = jdbcTemplate.queryForObject("""
				SELECT COUNT(*)
				FROM match_pairs
				WHERE (
					(userAId = :sourceUserId AND userBId = :candidateUserId)
					OR (userBId = :sourceUserId AND userAId = :candidateUserId)
				)
				AND (
					(status IN ('COMPLETED', 'CANCELLED', 'REJECTED')
						AND COALESCE(completedAt, closedAt, cancelledAt) <= :now
						AND TIMESTAMPADD(
							DAY,
							recentMatchExclusionDaysSnapshot,
							COALESCE(completedAt, closedAt, cancelledAt)
						) > :now)
					OR (status = 'EXPIRED'
						AND closedAt <= :now
						AND TIMESTAMPADD(HOUR, 24, closedAt) > :now)
				)
				""", parameters, Integer.class);
		return count != null && count > 0;
	}

	private MapSqlParameterSource cooldownParameters(
			Long sourceUserId,
			Long candidateUserId,
			LocalDateTime now
	) {
		return new MapSqlParameterSource()
				.addValue("sourceUserId", sourceUserId)
				.addValue("candidateUserId", candidateUserId)
				.addValue("now", now);
	}
}
