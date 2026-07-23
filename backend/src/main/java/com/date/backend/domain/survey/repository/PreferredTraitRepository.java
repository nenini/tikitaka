package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.PreferredTrait;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PreferredTraitRepository extends JpaRepository<PreferredTrait, Long> {

	@EntityGraph(attributePaths = "trait")
	List<PreferredTrait> findAllByUserIdOrderByTrait_DisplayOrderAsc(Long userId);

	void deleteAllByUserId(Long userId);
}
