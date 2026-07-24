package com.date.backend.domain.survey.repository;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.PreferredAgeRange;
import com.date.backend.domain.survey.domain.PreferredFaceTag;
import com.date.backend.domain.survey.domain.PreferredTrait;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.domain.UserPracticeGoal;
import com.date.backend.domain.survey.domain.UserTrait;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:survey-answer-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class SurveyAnswerRepositoryTest {

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private TraitCatalogRepository traitCatalogRepository;

	@Autowired
	private PracticeGoalCatalogRepository practiceGoalCatalogRepository;

	@Autowired
	private PreferredAgeRangeRepository preferredAgeRangeRepository;

	@Autowired
	private PreferredFaceTagRepository preferredFaceTagRepository;

	@Autowired
	private PreferredTraitRepository preferredTraitRepository;

	@Autowired
	private UserTraitRepository userTraitRepository;

	@Autowired
	private UserPracticeGoalRepository userPracticeGoalRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void surveyAnswersAreRetrievedWithCatalogsInDisplayOrder() {
		User user = saveUser("survey-answer@example.com");
		List<FaceTagCatalog> faceTags = faceTagCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc();
		List<TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY);
		List<PracticeGoalCatalog> goals = practiceGoalCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc();

		preferredAgeRangeRepository.save(new PreferredAgeRange(user.getId(), (short) 25, (short) 32));
		preferredFaceTagRepository.save(new PreferredFaceTag(user.getId(), faceTags.get(0)));
		preferredTraitRepository.saveAll(List.of(
				new PreferredTrait(user.getId(), traits.get(2)),
				new PreferredTrait(user.getId(), traits.get(0)),
				new PreferredTrait(user.getId(), traits.get(1))
		));
		userTraitRepository.saveAll(List.of(
				new UserTrait(user.getId(), traits.get(5)),
				new UserTrait(user.getId(), traits.get(3)),
				new UserTrait(user.getId(), traits.get(4))
		));
		userPracticeGoalRepository.saveAll(List.of(
				new UserPracticeGoal(user.getId(), goals.get(2)),
				new UserPracticeGoal(user.getId(), goals.get(0))
		));

		entityManager.flush();
		entityManager.clear();

		assertThat(preferredAgeRangeRepository.findByUserId(user.getId()))
				.get()
				.satisfies(ageRange -> {
					assertThat(ageRange.getMinPreferredAge()).isEqualTo((short) 25);
					assertThat(ageRange.getMaxPreferredAge()).isEqualTo((short) 32);
				});
		assertThat(preferredFaceTagRepository.findByUserId(user.getId()))
				.get()
				.extracting(answer -> answer.getFaceTag().getCode())
				.isEqualTo(faceTags.get(0).getCode());
		assertThat(preferredTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(user.getId()))
				.extracting(answer -> answer.getTrait().getCode())
				.containsExactly(
						traits.get(0).getCode(),
						traits.get(1).getCode(),
						traits.get(2).getCode()
				);
		assertThat(userTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(user.getId()))
				.extracting(answer -> answer.getTrait().getCode())
				.containsExactly(
						traits.get(3).getCode(),
						traits.get(4).getCode(),
						traits.get(5).getCode()
				);
		assertThat(userPracticeGoalRepository
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(user.getId()))
				.extracting(answer -> answer.getPracticeGoal().getCode())
				.containsExactly(
						goals.get(0).getCode(),
						goals.get(2).getCode()
				);
	}

	@Test
	void multipleChoiceAnswersCanBeReplacedOrDeactivated() {
		User user = saveUser("survey-update@example.com");
		List<TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY);
		PracticeGoalCatalog goal = practiceGoalCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.get(0);

		preferredTraitRepository.save(new PreferredTrait(user.getId(), traits.get(0)));
		userTraitRepository.save(new UserTrait(user.getId(), traits.get(1)));
		UserPracticeGoal userPracticeGoal = userPracticeGoalRepository.save(
				new UserPracticeGoal(user.getId(), goal)
		);
		entityManager.flush();

		preferredTraitRepository.deleteAllByUserId(user.getId());
		userTraitRepository.deleteAllByUserId(user.getId());
		userPracticeGoal.deactivate();
		entityManager.flush();
		entityManager.clear();

		assertThat(preferredTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(user.getId()))
				.isEmpty();
		assertThat(userTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(user.getId()))
				.isEmpty();
		assertThat(userPracticeGoalRepository
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(user.getId()))
				.isEmpty();
	}

	private User saveUser(String email) {
		return userRepository.save(new User(
				email,
				"password-hash",
				"설문 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
	}
}
