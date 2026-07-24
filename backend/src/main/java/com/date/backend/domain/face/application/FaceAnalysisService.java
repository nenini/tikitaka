package com.date.backend.domain.face.application;

import com.date.backend.domain.face.config.FaceAnalysisProperties;
import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.dto.request.FaceAnalysisFailureSubmitRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisFailureResponse;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.domain.face.exception.FaceAnalysisRequestExpiredException;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.FaceErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;

@Service
@Transactional(readOnly = true)
public class FaceAnalysisService {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");

	private final FaceAnalysisRequestRepository faceAnalysisRequestRepository;
	private final UserRepository userRepository;
	private final FaceAnalysisProperties properties;

	public FaceAnalysisService(
			FaceAnalysisRequestRepository faceAnalysisRequestRepository,
			UserRepository userRepository,
			FaceAnalysisProperties properties
	) {
		this.faceAnalysisRequestRepository = faceAnalysisRequestRepository;
		this.userRepository = userRepository;
		this.properties = properties;
	}

	@Transactional
	public FaceAnalysisRequestResponse createRequest(Long userId) {
		validateActiveUser(userId);

		LocalDateTime createdAt = LocalDateTime.now(SERVICE_ZONE_ID);
		LocalDateTime expiresAt = createdAt.plusSeconds(properties.requestValiditySeconds());
		FaceAnalysisRequest analysisRequest = new FaceAnalysisRequest(userId, createdAt, expiresAt);

		return FaceAnalysisRequestResponse.from(
				faceAnalysisRequestRepository.save(analysisRequest)
		);
	}

	@Transactional(noRollbackFor = FaceAnalysisRequestExpiredException.class)
	public FaceAnalysisFailureResponse submitFailure(
			Long userId,
			Long analysisRequestId,
			FaceAnalysisFailureSubmitRequest submitRequest
	) {
		validateActiveUser(userId);
		FaceAnalysisRequest analysisRequest =
				getAnalysisRequestForUpdate(analysisRequestId);
		validatePendingOwner(analysisRequest, userId);

		LocalDateTime failedAt = resolveTransitionAt(analysisRequest);
		if (analysisRequest.isExpiredAt(failedAt)) {
			analysisRequest.expire(failedAt);
			throw new FaceAnalysisRequestExpiredException();
		}
		if (submitRequest == null || submitRequest.failureCode() == null) {
			throw new BusinessException(FaceErrorCode.INVALID_ANALYSIS_RESULT);
		}

		analysisRequest.fail(submitRequest.failureCode(), failedAt);
		return FaceAnalysisFailureResponse.from(analysisRequest);
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

	private void validatePendingOwner(
			FaceAnalysisRequest analysisRequest,
			Long userId
	) {
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

	private LocalDateTime resolveTransitionAt(FaceAnalysisRequest analysisRequest) {
		LocalDateTime now = LocalDateTime.now(SERVICE_ZONE_ID);
		return now.isBefore(analysisRequest.getCreatedAt())
				? analysisRequest.getCreatedAt()
				: now;
	}

	private void validateActiveUser(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}
}
