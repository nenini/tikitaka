package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.PreferredFaceTag;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PreferredFaceTagRepository extends JpaRepository<PreferredFaceTag, Long> {

	@EntityGraph(attributePaths = "faceTag")
	Optional<PreferredFaceTag> findByUserId(Long userId);

	boolean existsByUserId(Long userId);
}
