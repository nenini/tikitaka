package com.date.backend.domain.coach.repository;

import com.date.backend.domain.coach.domain.AiSessionAnalysisEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiSessionAnalysisEventRepository
		extends JpaRepository<AiSessionAnalysisEvent, String> {
}
