package com.date.backend.domain.face.application;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisResult;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.domain.FaceType;
import com.date.backend.domain.face.domain.UserFaceTag;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultTagRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
import com.date.backend.domain.face.exception.FaceAnalysisRequestExpiredException;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.face.repository.FaceAnalysisResultRepository;
import com.date.backend.domain.face.repository.UserFaceTagRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.FaceErrorCode;
import com.date.backend.global.exception.code.ProfileErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class FaceAnalysisResultService {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");
	private static final int MAX_FACE_TAG_COUNT = FaceType.values().length;

	private final FaceAnalysisRequestRepository faceAnalysisRequestRepository;
	private final FaceAnalysisResultRepository faceAnalysisResultRepository;
	private final UserFaceTagRepository userFaceTagRepository;
	private final FaceTagCatalogRepository faceTagCatalogRepository;
	private final UserRepository userRepository;
	private final ProfileRepository profileRepository;

	public FaceAnalysisResultService(
			FaceAnalysisRequestRepository faceAnalysisRequestRepository,
			FaceAnalysisResultRepository faceAnalysisResultRepository,
			UserFaceTagRepository userFaceTagRepository,
			FaceTagCatalogRepository faceTagCatalogRepository,
			UserRepository userRepository,
			ProfileRepository profileRepository
	) {
		this.faceAnalysisRequestRepository = faceAnalysisRequestRepository;
		this.faceAnalysisResultRepository = faceAnalysisResultRepository;
		this.userFaceTagRepository = userFaceTagRepository;
		this.faceTagCatalogRepository = faceTagCatalogRepository;
		this.userRepository = userRepository;
		this.profileRepository = profileRepository;
	}

	@Transactional(noRollbackFor = FaceAnalysisRequestExpiredException.class)
	public FaceAnalysisResultResponse submitResult(
			Long userId,
			Long analysisRequestId,
			FaceAnalysisResultSubmitRequest submitRequest
	) {
		validateActiveUser(userId);
		FaceAnalysisRequest analysisRequest = getAnalysisRequestForUpdate(analysisRequestId);
		validateRequest(analysisRequest, userId);

		LocalDateTime analyzedAt = LocalDateTime.now(SERVICE_ZONE_ID);
		if (analysisRequest.isExpiredAt(analyzedAt)) {
			analysisRequest.expire(analyzedAt);
			throw new FaceAnalysisRequestExpiredException();
		}
		if (faceAnalysisResultRepository.existsByAnalysisRequest_Id(analysisRequestId)) {
			throw new BusinessException(FaceErrorCode.ANALYSIS_RESULT_ALREADY_EXISTS);
		}

		List<FaceAnalysisResultTagRequest> sortedTags =
				validateAndSortTags(submitRequest);
		Profile profile = profileRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ProfileErrorCode.PROFILE_NOT_FOUND));
		Map<FaceType, FaceTagCatalog> catalogs = getAndValidateCatalogs(
				sortedTags,
				profile.getGender()
		);

		FaceAnalysisResult result = createResult(
				analysisRequest,
				userId,
				submitRequest.modelVersion(),
				sortedTags,
				catalogs,
				analyzedAt
		);

		userFaceTagRepository.deleteAllByUserId(userId);
		FaceAnalysisResult savedResult = faceAnalysisResultRepository.save(result);
		List<UserFaceTag> currentFaceTags = savedResult.getTags().stream()
				.map(UserFaceTag::from)
				.toList();
		userFaceTagRepository.saveAll(currentFaceTags);
		analysisRequest.complete(analyzedAt);

		return FaceAnalysisResultResponse.from(savedResult);
	}

	private FaceAnalysisRequest getAnalysisRequestForUpdate(Long analysisRequestId) {
		if (analysisRequestId == null || analysisRequestId <= 0) {
			throw new BusinessException(FaceErrorCode.ANALYSIS_REQUEST_NOT_FOUND);
		}
		return faceAnalysisRequestRepository.findByIdForUpdate(analysisRequestId)
				.orElseThrow(() -> new BusinessException(
						FaceErrorCode.ANALYSIS_REQUEST_NOT_FOUND
				));
	}

	private void validateRequest(FaceAnalysisRequest analysisRequest, Long userId) {
		if (!analysisRequest.getUserId().equals(userId)) {
			throw new BusinessException(FaceErrorCode.ANALYSIS_REQUEST_FORBIDDEN);
		}
		if (analysisRequest.getStatus() == FaceAnalysisStatus.EXPIRED) {
			throw new FaceAnalysisRequestExpiredException();
		}
		if (analysisRequest.getStatus() != FaceAnalysisStatus.PENDING) {
			throw new BusinessException(FaceErrorCode.ANALYSIS_REQUEST_NOT_PENDING);
		}
	}

	private List<FaceAnalysisResultTagRequest> validateAndSortTags(
			FaceAnalysisResultSubmitRequest submitRequest
	) {
		if (submitRequest == null
				|| submitRequest.modelVersion() == null
				|| submitRequest.modelVersion().isBlank()
				|| submitRequest.modelVersion().strip().length() > 100
				|| submitRequest.tags() == null
				|| submitRequest.tags().isEmpty()
				|| submitRequest.tags().size() > MAX_FACE_TAG_COUNT) {
			throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
		}

		Set<FaceType> faceTypes = new HashSet<>();
		Set<Short> ranks = new HashSet<>();
		List<FaceAnalysisResultTagRequest> sortedTags =
				new ArrayList<>(submitRequest.tags());
		for (FaceAnalysisResultTagRequest tag : sortedTags) {
			validateTag(tag);
			if (!faceTypes.add(tag.code()) || !ranks.add(tag.rank())) {
				throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
			}
		}

		sortedTags.sort(Comparator.comparingInt(FaceAnalysisResultTagRequest::rank));
		for (int index = 0; index < sortedTags.size(); index++) {
			if (sortedTags.get(index).rank() != index + 1) {
				throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
			}
		}
		return sortedTags;
	}

	private void validateTag(FaceAnalysisResultTagRequest tag) {
		if (tag == null
				|| tag.code() == null
				|| tag.relativeScore() == null
				|| tag.relativeScore().compareTo(BigDecimal.ZERO) < 0
				|| tag.relativeScore().compareTo(BigDecimal.ONE) > 0
				|| tag.relativeScore().scale() > 6
				|| tag.rank() == null
				|| tag.rank() <= 0
				|| tag.rank() > MAX_FACE_TAG_COUNT) {
			throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
		}
	}

	private Map<FaceType, FaceTagCatalog> getAndValidateCatalogs(
			List<FaceAnalysisResultTagRequest> tags,
			Gender gender
	) {
		Set<String> codes = tags.stream()
				.map(tag -> tag.code().name())
				.collect(java.util.stream.Collectors.toSet());
		List<FaceTagCatalog> foundCatalogs =
				faceTagCatalogRepository.findAllByCodeInAndActiveTrue(codes);
		if (foundCatalogs.size() != codes.size()) {
			throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
		}

		Map<FaceType, FaceTagCatalog> catalogs = new HashMap<>();
		for (FaceTagCatalog catalog : foundCatalogs) {
			validateApplicableGender(catalog, gender);
			try {
				catalogs.put(FaceType.valueOf(catalog.getCode()), catalog);
			} catch (IllegalArgumentException exception) {
				throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
			}
		}
		return catalogs;
	}

	private void validateApplicableGender(FaceTagCatalog catalog, Gender gender) {
		ApplicableGender applicableGender = catalog.getApplicableGender();
		boolean applicable = applicableGender == ApplicableGender.ALL
				|| applicableGender.name().equals(gender.name());
		if (!applicable) {
			throw new BusinessException(FaceErrorCode.FACE_TYPE_NOT_APPLICABLE);
		}
	}

	private FaceAnalysisResult createResult(
			FaceAnalysisRequest analysisRequest,
			Long userId,
			String modelVersion,
			List<FaceAnalysisResultTagRequest> sortedTags,
			Map<FaceType, FaceTagCatalog> catalogs,
			LocalDateTime analyzedAt
	) {
		FaceAnalysisResultTagRequest primaryTag = sortedTags.get(0);
		FaceAnalysisResult result = new FaceAnalysisResult(
				analysisRequest,
				userId,
				catalogs.get(primaryTag.code()),
				modelVersion,
				analyzedAt
		);
		for (FaceAnalysisResultTagRequest tag : sortedTags) {
			result.addTag(
					catalogs.get(tag.code()),
					tag.relativeScore(),
					tag.rank()
			);
		}
		result.validateTags();
		return result;
	}

	private void validateActiveUser(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}
}
