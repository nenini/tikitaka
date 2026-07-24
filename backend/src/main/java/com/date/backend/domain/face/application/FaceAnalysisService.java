package com.date.backend.domain.face.application;

import com.date.backend.domain.face.config.FaceAnalysisProperties;
import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
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

	private void validateActiveUser(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}
}
