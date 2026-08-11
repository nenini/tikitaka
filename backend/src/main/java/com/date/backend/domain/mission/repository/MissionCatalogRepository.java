package com.date.backend.domain.mission.repository;

import com.date.backend.domain.mission.domain.MissionCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MissionCatalogRepository
		extends JpaRepository<MissionCatalog, Long> {
	List<MissionCatalog>
	findAllByPracticeGoalCodeInAndActiveTrueOrderByDisplayOrderAsc(
			Collection<String> practiceGoalCodes
	);
}
