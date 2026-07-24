package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FaceTagCatalogRepository extends JpaRepository<FaceTagCatalog, Long> {

	List<FaceTagCatalog> findAllByActiveTrueOrderByDisplayOrderAsc();

	List<FaceTagCatalog> findAllByActiveTrueAndApplicableGenderInOrderByDisplayOrderAsc(
			Collection<ApplicableGender> applicableGenders
	);

	Optional<FaceTagCatalog> findByIdAndActiveTrue(Long id);
}
