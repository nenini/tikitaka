package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.UserTrait;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserTraitRepository extends JpaRepository<UserTrait, Long> {

	@EntityGraph(attributePaths = "trait")
	List<UserTrait> findAllByUserIdOrderByTrait_DisplayOrderAsc(Long userId);

	void deleteAllByUserId(Long userId);
}
