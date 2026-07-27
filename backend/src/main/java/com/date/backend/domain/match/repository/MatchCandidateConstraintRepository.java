package com.date.backend.domain.match.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

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
}
