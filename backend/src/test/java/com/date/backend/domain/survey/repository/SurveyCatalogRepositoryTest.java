package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.GoalCategory;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:survey-catalog-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class SurveyCatalogRepositoryTest {

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private TraitCatalogRepository traitCatalogRepository;

	@Autowired
	private PracticeGoalCatalogRepository practiceGoalCatalogRepository;

	@Test
	void activeCatalogsAreReturnedInDisplayOrder() {
		List<FaceTagCatalog> faceTags = faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		List<TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY);
		List<PracticeGoalCatalog> practiceGoals = practiceGoalCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc();

		assertThat(faceTags).hasSize(10);
		assertThat(faceTags).extracting(FaceTagCatalog::getDisplayOrder).isSorted();
		assertThat(traits).hasSize(11);
		assertThat(traits).extracting(TraitCatalog::getDisplayOrder).isSorted();
		assertThat(practiceGoals).hasSize(5);
		assertThat(practiceGoals).extracting(PracticeGoalCatalog::getDisplayOrder).isSorted();
		assertThat(faceTagCatalogRepository.countByActiveTrue()).isEqualTo(10);
		assertThat(traitCatalogRepository.countByTypeAndActiveTrue(TraitType.PERSONALITY))
				.isEqualTo(11);
		assertThat(practiceGoalCatalogRepository.countByActiveTrue()).isEqualTo(5);
	}

	@Test
	void faceTagsCanBeFilteredByApplicableGender() {
		List<FaceTagCatalog> femaleFaceTags = faceTagCatalogRepository
				.findAllByActiveTrueAndApplicableGenderInOrderByDisplayOrderAsc(
						Set.of(ApplicableGender.ALL, ApplicableGender.FEMALE)
				);

		assertThat(femaleFaceTags).hasSize(9);
		assertThat(femaleFaceTags)
				.extracting(FaceTagCatalog::getApplicableGender)
				.doesNotContain(ApplicableGender.MALE);
	}

	@Test
	void practiceGoalsCanBeFilteredByCategory() {
		List<PracticeGoalCatalog> speechAmountGoals = practiceGoalCatalogRepository
				.findAllByCategoryAndActiveTrueOrderByDisplayOrderAsc(GoalCategory.SPEECH_AMOUNT);

		assertThat(speechAmountGoals)
				.hasSize(2)
				.allMatch(goal -> goal.getCategory() == GoalCategory.SPEECH_AMOUNT);
	}
}
