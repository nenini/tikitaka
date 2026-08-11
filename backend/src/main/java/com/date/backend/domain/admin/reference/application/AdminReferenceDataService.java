package com.date.backend.domain.admin.reference.application;

import com.date.backend.domain.admin.reference.dto.response.ReferenceDataSummaryResponse;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.PracticeGoalCatalogRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AdminReferenceDataService {

	private final FaceTagCatalogRepository faceTagCatalogRepository;
	private final TraitCatalogRepository traitCatalogRepository;
	private final PracticeGoalCatalogRepository practiceGoalCatalogRepository;

	public AdminReferenceDataService(
			FaceTagCatalogRepository faceTagCatalogRepository,
			TraitCatalogRepository traitCatalogRepository,
			PracticeGoalCatalogRepository practiceGoalCatalogRepository
	) {
		this.faceTagCatalogRepository = faceTagCatalogRepository;
		this.traitCatalogRepository = traitCatalogRepository;
		this.practiceGoalCatalogRepository = practiceGoalCatalogRepository;
	}

	public ReferenceDataSummaryResponse getSummary() {
		return new ReferenceDataSummaryResponse(
				faceTagCatalogRepository.countByActiveTrue(),
				traitCatalogRepository.countByTypeAndActiveTrue(TraitType.PERSONALITY),
				practiceGoalCatalogRepository.countByActiveTrue()
		);
	}
}
