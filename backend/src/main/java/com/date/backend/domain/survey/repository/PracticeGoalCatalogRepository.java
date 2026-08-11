package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.GoalCategory;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PracticeGoalCatalogRepository extends JpaRepository<PracticeGoalCatalog, Long> {

	List<PracticeGoalCatalog> findAllByActiveTrueOrderByDisplayOrderAsc();

	List<PracticeGoalCatalog> findAllByCategoryAndActiveTrueOrderByDisplayOrderAsc(GoalCategory category);

	List<PracticeGoalCatalog> findAllByIdInAndActiveTrue(Collection<Long> ids);

	Optional<PracticeGoalCatalog> findByIdAndActiveTrue(Long id);

	long countByActiveTrue();
}
