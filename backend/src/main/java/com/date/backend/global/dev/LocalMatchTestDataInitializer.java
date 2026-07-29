package com.date.backend.global.dev;

import com.date.backend.domain.face.application.FaceAnalysisResultService;
import com.date.backend.domain.face.application.FaceAnalysisService;
import com.date.backend.domain.face.domain.FaceType;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultTagRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.domain.face.repository.UserFaceTagRepository;
import com.date.backend.domain.profile.application.ProfileService;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.dto.request.ProfileCreateRequest;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.application.SurveyService;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.PracticeGoalCatalogRepository;
import com.date.backend.domain.survey.repository.PreferredAgeRangeRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@Profile("local")
@ConditionalOnProperty(
		prefix = "app.local-seed",
		name = "match-test-users-enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class LocalMatchTestDataInitializer implements ApplicationRunner {

	private static final Logger log =
			LoggerFactory.getLogger(LocalMatchTestDataInitializer.class);
	private static final String TEST_PASSWORD = "qwer1234@";
	private static final String MODEL_VERSION = "local-match-seed-v1";

	private static final List<SeedUser> SEED_USERS = List.of(
			new SeedUser(
					"match.woman@example.com",
					"매칭여자",
					"김여자",
					LocalDate.of(2000, 7, 27),
					Gender.FEMALE,
					FaceType.DOG,
					"DINOSAUR",
					List.of("GENTLE", "RELAXED", "FRIENDLY"),
					List.of("KIND", "ALOOF", "HONEST"),
					(short) 24,
					(short) 28,
					List.of("TALK_TOO_MUCH", "VOICE_TOO_LOUD")
			),
			new SeedUser(
					"match.man@example.com",
					"매칭남자",
					"김남자",
					LocalDate.of(2003, 7, 27),
					Gender.MALE,
					FaceType.DINOSAUR,
					"DOG",
					List.of("KIND", "ALOOF", "HONEST"),
					List.of("GENTLE", "RELAXED", "FRIENDLY"),
					(short) 25,
					(short) 30,
					List.of("TALK_TOO_LITTLE", "VOICE_TOO_QUIET")
			)
	);

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final ProfileRepository profileRepository;
	private final ProfileService profileService;
	private final UserFaceTagRepository userFaceTagRepository;
	private final FaceAnalysisService faceAnalysisService;
	private final FaceAnalysisResultService faceAnalysisResultService;
	private final PreferredAgeRangeRepository preferredAgeRangeRepository;
	private final FaceTagCatalogRepository faceTagCatalogRepository;
	private final TraitCatalogRepository traitCatalogRepository;
	private final PracticeGoalCatalogRepository practiceGoalCatalogRepository;
	private final SurveyService surveyService;

	public LocalMatchTestDataInitializer(
			UserRepository userRepository,
			PasswordEncoder passwordEncoder,
			ProfileRepository profileRepository,
			ProfileService profileService,
			UserFaceTagRepository userFaceTagRepository,
			FaceAnalysisService faceAnalysisService,
			FaceAnalysisResultService faceAnalysisResultService,
			PreferredAgeRangeRepository preferredAgeRangeRepository,
			FaceTagCatalogRepository faceTagCatalogRepository,
			TraitCatalogRepository traitCatalogRepository,
			PracticeGoalCatalogRepository practiceGoalCatalogRepository,
			SurveyService surveyService
	) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.profileRepository = profileRepository;
		this.profileService = profileService;
		this.userFaceTagRepository = userFaceTagRepository;
		this.faceAnalysisService = faceAnalysisService;
		this.faceAnalysisResultService = faceAnalysisResultService;
		this.preferredAgeRangeRepository = preferredAgeRangeRepository;
		this.faceTagCatalogRepository = faceTagCatalogRepository;
		this.traitCatalogRepository = traitCatalogRepository;
		this.practiceGoalCatalogRepository = practiceGoalCatalogRepository;
		this.surveyService = surveyService;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		for (SeedUser seed : SEED_USERS) {
			seed(seed);
		}
		log.info(
				"Local match test users are ready. emails={}",
				SEED_USERS.stream().map(SeedUser::email).toList()
		);
	}

	private void seed(SeedUser seed) {
		User user = createOrGetUser(seed);
		Long userId = user.getId();

		if (!profileRepository.existsById(userId)) {
			profileService.create(
					userId,
					new ProfileCreateRequest(
							seed.nickname(),
							seed.gender(),
							"서울특별시"
					)
			);
		}
		if (userFaceTagRepository
				.findFirstByUserIdOrderByRankOrderAsc(userId)
				.isEmpty()) {
			createFaceAnalysis(userId, seed.faceType());
		}
		if (preferredAgeRangeRepository.findByUserId(userId).isEmpty()) {
			surveyService.create(userId, createSurveyRequest(seed));
		}
		profileService.markOnboardingCompleted(userId);
	}

	private User createOrGetUser(SeedUser seed) {
		return userRepository.findByEmail(seed.email())
				.orElseGet(() -> userRepository.saveAndFlush(new User(
						seed.email(),
						passwordEncoder.encode(TEST_PASSWORD),
						seed.realName(),
						"010-0000-0000",
						seed.birthDate()
				)));
	}

	private void createFaceAnalysis(Long userId, FaceType faceType) {
		FaceAnalysisRequestResponse analysisRequest =
				faceAnalysisService.createRequest(userId);
		faceAnalysisResultService.submitResult(
				userId,
				analysisRequest.analysisRequestId(),
				new FaceAnalysisResultSubmitRequest(
						MODEL_VERSION,
						List.of(new FaceAnalysisResultTagRequest(
								faceType,
								BigDecimal.ONE,
								(short) 1
						))
				)
		);
	}

	private SurveySaveRequest createSurveyRequest(SeedUser seed) {
		Map<String, FaceTagCatalog> faceTags = faceTagCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.stream()
				.collect(Collectors.toMap(FaceTagCatalog::getCode, Function.identity()));
		Map<String, TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(
						TraitType.PERSONALITY
				)
				.stream()
				.collect(Collectors.toMap(TraitCatalog::getCode, Function.identity()));
		Map<String, PracticeGoalCatalog> practiceGoals =
				practiceGoalCatalogRepository
						.findAllByActiveTrueOrderByDisplayOrderAsc()
						.stream()
						.collect(Collectors.toMap(
								PracticeGoalCatalog::getCode,
								Function.identity()
						));

		return new SurveySaveRequest(
				require(faceTags, seed.preferredFaceCode()).getId(),
				ids(traits, seed.preferredTraitCodes()),
				ids(traits, seed.userTraitCodes()),
				seed.minPreferredAge(),
				seed.maxPreferredAge(),
				ids(practiceGoals, seed.practiceGoalCodes())
		);
	}

	private <T> T require(Map<String, T> catalogs, String code) {
		T catalog = catalogs.get(code);
		if (catalog == null) {
			throw new IllegalStateException(
					"Local seed catalog is missing. code=" + code
			);
		}
		return catalog;
	}

	private <T> List<Long> ids(
			Map<String, T> catalogs,
			List<String> codes
	) {
		return codes.stream()
				.map(code -> catalogId(require(catalogs, code)))
				.toList();
	}

	private Long catalogId(Object catalog) {
		if (catalog instanceof TraitCatalog trait) {
			return trait.getId();
		}
		if (catalog instanceof PracticeGoalCatalog goal) {
			return goal.getId();
		}
		throw new IllegalArgumentException(
				"Unsupported local seed catalog: " + catalog.getClass().getName()
		);
	}

	private record SeedUser(
			String email,
			String nickname,
			String realName,
			LocalDate birthDate,
			Gender gender,
			FaceType faceType,
			String preferredFaceCode,
			List<String> preferredTraitCodes,
			List<String> userTraitCodes,
			short minPreferredAge,
			short maxPreferredAge,
			List<String> practiceGoalCodes
	) {
	}
}
