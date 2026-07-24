package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TraitCatalogRepository extends JpaRepository<TraitCatalog, Long> {

	List<TraitCatalog> findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType type);

	List<TraitCatalog> findAllByIdInAndTypeAndActiveTrue(Collection<Long> ids, TraitType type);

	Optional<TraitCatalog> findByIdAndTypeAndActiveTrue(Long id, TraitType type);
}
