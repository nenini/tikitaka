package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.UserPracticeGoal;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserPracticeGoalRepository extends JpaRepository<UserPracticeGoal, Long> {

	@EntityGraph(attributePaths = "practiceGoal")
	List<UserPracticeGoal> findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(Long userId);

	boolean existsByUserIdAndActiveTrue(Long userId);
}
