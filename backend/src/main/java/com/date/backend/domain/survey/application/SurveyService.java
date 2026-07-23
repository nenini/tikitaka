package com.date.backend.domain.survey.application;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.PreferredAgeRange;
import com.date.backend.domain.survey.domain.PreferredFaceTag;
import com.date.backend.domain.survey.domain.PreferredTrait;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.domain.UserPracticeGoal;
import com.date.backend.domain.survey.domain.UserTrait;
import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.domain.survey.dto.response.SurveyOptionsResponse;
import com.date.backend.domain.survey.dto.response.SurveyResponse;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.PracticeGoalCatalogRepository;
import com.date.backend.domain.survey.repository.PreferredAgeRangeRepository;
import com.date.backend.domain.survey.repository.PreferredFaceTagRepository;
import com.date.backend.domain.survey.repository.PreferredTraitRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import com.date.backend.domain.survey.repository.UserPracticeGoalRepository;
import com.date.backend.domain.survey.repository.UserTraitRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class SurveyService {
	private static final int REQUIRED_TRAIT_COUNT = 3;

	private final ProfileRepository profileRepository;
	private final FaceTagCatalogRepository faceTagCatalogRepository;
	private final TraitCatalogRepository traitCatalogRepository;
	private final PracticeGoalCatalogRepository practiceGoalCatalogRepository;
	private final PreferredAgeRangeRepository preferredAgeRangeRepository;
	private final PreferredFaceTagRepository preferredFaceTagRepository;
	private final PreferredTraitRepository preferredTraitRepository;
	private final UserTraitRepository userTraitRepository;
	private final UserPracticeGoalRepository userPracticeGoalRepository;

	public SurveyService(
			ProfileRepository profileRepository,
			FaceTagCatalogRepository faceTagCatalogRepository,
			TraitCatalogRepository traitCatalogRepository,
			PracticeGoalCatalogRepository practiceGoalCatalogRepository,
			PreferredAgeRangeRepository preferredAgeRangeRepository,
			PreferredFaceTagRepository preferredFaceTagRepository,
			PreferredTraitRepository preferredTraitRepository,
			UserTraitRepository userTraitRepository,
			UserPracticeGoalRepository userPracticeGoalRepository
	) {
		this.profileRepository = profileRepository;
		this.faceTagCatalogRepository = faceTagCatalogRepository;
		this.traitCatalogRepository = traitCatalogRepository;
		this.practiceGoalCatalogRepository = practiceGoalCatalogRepository;
		this.preferredAgeRangeRepository = preferredAgeRangeRepository;
		this.preferredFaceTagRepository = preferredFaceTagRepository;
		this.preferredTraitRepository = preferredTraitRepository;
		this.userTraitRepository = userTraitRepository;
		this.userPracticeGoalRepository = userPracticeGoalRepository;
	}

	public SurveyOptionsResponse getOptions(Long userId) {
		Profile profile = getProfile(userId);
		ApplicableGender preferredGender = getPreferredGender(profile.getGender());

		return SurveyOptionsResponse.of(
				faceTagCatalogRepository
						.findAllByActiveTrueAndApplicableGenderInOrderByDisplayOrderAsc(
								Set.of(ApplicableGender.ALL, preferredGender)
						),
				traitCatalogRepository
						.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY),
				practiceGoalCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc()
		);
	}

	@Transactional
	public SurveyResponse create(Long userId, SurveySaveRequest request) {
		Profile profile = getProfile(userId);
		validateRequest(request);
		if (hasAnyAnswer(userId)) {
			throw new BusinessException(ErrorCode.SURVEY_ALREADY_EXISTS);
		}

		ResolvedOptions options = resolveOptions(profile, request);
		saveNewAnswers(userId, request, options);
		return getSurvey(userId);
	}

	public SurveyResponse get(Long userId) {
		getProfile(userId);
		return getSurvey(userId);
	}

	@Transactional
	public SurveyResponse update(Long userId, SurveySaveRequest request) {
		Profile profile = getProfile(userId);
		validateRequest(request);
		SurveyAnswers answers = getSurveyAnswers(userId);
		ResolvedOptions options = resolveOptions(profile, request);

		answers.preferredAgeRange().update(
				request.minPreferredAge(),
				request.maxPreferredAge()
		);
		answers.preferredFaceTag().update(options.faceTag());

		preferredTraitRepository.deleteAllByUserId(userId);
		preferredTraitRepository.flush();
		preferredTraitRepository.saveAll(toPreferredTraits(userId, options.preferredTraits()));

		userTraitRepository.deleteAllByUserId(userId);
		userTraitRepository.flush();
		userTraitRepository.saveAll(toUserTraits(userId, options.userTraits()));

		answers.practiceGoals().forEach(UserPracticeGoal::deactivate);
		userPracticeGoalRepository.saveAll(toPracticeGoals(userId, options.practiceGoals()));

		return getSurvey(userId);
	}

	private void saveNewAnswers(
			Long userId,
			SurveySaveRequest request,
			ResolvedOptions options
	) {
		preferredAgeRangeRepository.save(new PreferredAgeRange(
				userId,
				request.minPreferredAge(),
				request.maxPreferredAge()
		));
		preferredFaceTagRepository.save(new PreferredFaceTag(userId, options.faceTag()));
		preferredTraitRepository.saveAll(toPreferredTraits(userId, options.preferredTraits()));
		userTraitRepository.saveAll(toUserTraits(userId, options.userTraits()));
		userPracticeGoalRepository.saveAll(toPracticeGoals(userId, options.practiceGoals()));
	}

	private SurveyResponse getSurvey(Long userId) {
		SurveyAnswers answers = getSurveyAnswers(userId);
		return SurveyResponse.of(
				userId,
				answers.preferredFaceTag(),
				answers.preferredTraits(),
				answers.userTraits(),
				answers.preferredAgeRange(),
				answers.practiceGoals()
		);
	}

	private SurveyAnswers getSurveyAnswers(Long userId) {
		PreferredAgeRange preferredAgeRange = preferredAgeRangeRepository.findByUserId(userId)
				.orElseThrow(() -> new BusinessException(ErrorCode.SURVEY_NOT_FOUND));
		PreferredFaceTag preferredFaceTag = preferredFaceTagRepository.findByUserId(userId)
				.orElseThrow(() -> new BusinessException(ErrorCode.SURVEY_NOT_FOUND));
		List<PreferredTrait> preferredTraits = preferredTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(userId);
		List<UserTrait> userTraits = userTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(userId);
		List<UserPracticeGoal> practiceGoals = userPracticeGoalRepository
				.findAllByUserIdAndActiveTrueOrderByPracticeGoal_DisplayOrderAsc(userId);

		if (preferredTraits.size() != REQUIRED_TRAIT_COUNT
				|| userTraits.size() != REQUIRED_TRAIT_COUNT
				|| practiceGoals.isEmpty()) {
			throw new BusinessException(ErrorCode.SURVEY_NOT_FOUND);
		}

		return new SurveyAnswers(
				preferredAgeRange,
				preferredFaceTag,
				preferredTraits,
				userTraits,
				practiceGoals
		);
	}

	private ResolvedOptions resolveOptions(Profile profile, SurveySaveRequest request) {
		FaceTagCatalog faceTag = faceTagCatalogRepository
				.findByIdAndActiveTrue(request.preferredFaceTagId())
				.orElseThrow(() -> new BusinessException(ErrorCode.INVALID_SURVEY_OPTION));
		validateFaceTagGender(profile.getGender(), faceTag);

		List<TraitCatalog> preferredTraits = traitCatalogRepository
				.findAllByIdInAndTypeAndActiveTrue(
						request.preferredTraitIds(),
						TraitType.PERSONALITY
				);
		List<TraitCatalog> userTraits = traitCatalogRepository
				.findAllByIdInAndTypeAndActiveTrue(
						request.userTraitIds(),
						TraitType.PERSONALITY
				);
		List<PracticeGoalCatalog> practiceGoals = practiceGoalCatalogRepository
				.findAllByIdInAndActiveTrue(request.practiceGoalIds());

		if (preferredTraits.size() != REQUIRED_TRAIT_COUNT
				|| userTraits.size() != REQUIRED_TRAIT_COUNT
				|| practiceGoals.size() != request.practiceGoalIds().size()) {
			throw new BusinessException(ErrorCode.INVALID_SURVEY_OPTION);
		}

		return new ResolvedOptions(faceTag, preferredTraits, userTraits, practiceGoals);
	}

	private void validateFaceTagGender(Gender userGender, FaceTagCatalog faceTag) {
		ApplicableGender preferredGender = getPreferredGender(userGender);
		if (faceTag.getApplicableGender() != ApplicableGender.ALL
				&& faceTag.getApplicableGender() != preferredGender) {
			throw new BusinessException(ErrorCode.INVALID_SURVEY_OPTION);
		}
	}

	private ApplicableGender getPreferredGender(Gender userGender) {
		return userGender == Gender.MALE
				? ApplicableGender.FEMALE
				: ApplicableGender.MALE;
	}

	private void validateRequest(SurveySaveRequest request) {
		if (request == null
				|| request.preferredFaceTagId() == null
				|| request.preferredFaceTagId() <= 0
				|| !hasExactlyThreeDistinctPositiveIds(request.preferredTraitIds())
				|| !hasExactlyThreeDistinctPositiveIds(request.userTraitIds())
				|| request.minPreferredAge() == null
				|| request.maxPreferredAge() == null
				|| request.minPreferredAge() <= 0
				|| request.maxPreferredAge() < request.minPreferredAge()
				|| !hasDistinctPositiveIds(request.practiceGoalIds())) {
			throw new BusinessException(ErrorCode.INVALID_INPUT);
		}
	}

	private boolean hasExactlyThreeDistinctPositiveIds(List<Long> ids) {
		return ids != null
				&& ids.size() == REQUIRED_TRAIT_COUNT
				&& hasDistinctPositiveIds(ids);
	}

	private boolean hasDistinctPositiveIds(List<Long> ids) {
		return ids != null
				&& !ids.isEmpty()
				&& ids.stream().allMatch(id -> id != null && id > 0)
				&& new HashSet<>(ids).size() == ids.size();
	}

	private boolean hasAnyAnswer(Long userId) {
		return preferredAgeRangeRepository.existsById(userId)
				|| preferredFaceTagRepository.existsByUserId(userId)
				|| preferredTraitRepository.existsByUserId(userId)
				|| userTraitRepository.existsByUserId(userId)
				|| userPracticeGoalRepository.existsByUserIdAndActiveTrue(userId);
	}

	private Profile getProfile(Long userId) {
		return profileRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ErrorCode.PROFILE_NOT_FOUND));
	}

	private List<PreferredTrait> toPreferredTraits(
			Long userId,
			List<TraitCatalog> traits
	) {
		return traits.stream()
				.map(trait -> new PreferredTrait(userId, trait))
				.toList();
	}

	private List<UserTrait> toUserTraits(Long userId, List<TraitCatalog> traits) {
		return traits.stream()
				.map(trait -> new UserTrait(userId, trait))
				.toList();
	}

	private List<UserPracticeGoal> toPracticeGoals(
			Long userId,
			List<PracticeGoalCatalog> practiceGoals
	) {
		return practiceGoals.stream()
				.map(practiceGoal -> new UserPracticeGoal(userId, practiceGoal))
				.toList();
	}

	private record ResolvedOptions(
			FaceTagCatalog faceTag,
			List<TraitCatalog> preferredTraits,
			List<TraitCatalog> userTraits,
			List<PracticeGoalCatalog> practiceGoals
	) {
	}

	private record SurveyAnswers(
			PreferredAgeRange preferredAgeRange,
			PreferredFaceTag preferredFaceTag,
			List<PreferredTrait> preferredTraits,
			List<UserTrait> userTraits,
			List<UserPracticeGoal> practiceGoals
	) {
	}
}
