package com.date.backend.domain.moderation.repository;

import com.date.backend.domain.moderation.domain.AttendancePenalty;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AttendancePenaltyRepository extends JpaRepository<AttendancePenalty, Long> {
	Optional<AttendancePenalty> findBySessionIdAndUserIdAndPenaltyType(Long sessionId, Long userId, String penaltyType);
	long countByUserIdAndPenaltyType(Long userId, String penaltyType);
}
