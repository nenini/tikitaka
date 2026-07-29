package com.date.backend.domain.admin.reference.application;

import com.date.backend.domain.admin.reference.dto.response.ReferenceDataSummaryResponse;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.PracticeGoalCatalogRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminReferenceDataServiceTest {

	@Test
	void countsActiveReferenceDataFromCatalogRepositories() {
		FaceTagCatalogRepository faceRepository = mock(FaceTagCatalogRepository.class);
		TraitCatalogRepository traitRepository = mock(TraitCatalogRepository.class);
		PracticeGoalCatalogRepository goalRepository =
				mock(PracticeGoalCatalogRepository.class);
		AdminReferenceDataService service = new AdminReferenceDataService(
				faceRepository,
				traitRepository,
				goalRepository
		);
		when(faceRepository.countByActiveTrue()).thenReturn(10L);
		when(traitRepository.countByTypeAndActiveTrue(TraitType.PERSONALITY))
				.thenReturn(11L);
		when(goalRepository.countByActiveTrue()).thenReturn(5L);

		ReferenceDataSummaryResponse response = service.getSummary();

		assertThat(response.faceTypeCount()).isEqualTo(10);
		assertThat(response.personalityCount()).isEqualTo(11);
		assertThat(response.concernCount()).isEqualTo(5);
	}
}
