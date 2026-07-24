package com.date.backend.domain.consent.repository;

import com.date.backend.domain.consent.domain.ConsentType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ConsentTypeRepository extends JpaRepository<ConsentType, Long> {
	List<ConsentType> findAllByActiveTrueOrderByIdAsc();

	List<ConsentType> findAllByIdInAndActiveTrue(Collection<Long> ids);
}
