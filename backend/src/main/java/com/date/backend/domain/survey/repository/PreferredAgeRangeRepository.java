package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.PreferredAgeRange;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PreferredAgeRangeRepository extends JpaRepository<PreferredAgeRange, Long> {

	Optional<PreferredAgeRange> findByUserId(Long userId);
}
