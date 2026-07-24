package com.date.backend.domain.face.application;

import com.date.backend.domain.face.config.FaceAnalysisProperties;
import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FaceAnalysisServiceTest {
	private static final Long USER_ID = 1L;
	private static final long REQUEST_VALIDITY_SECONDS = 600L;

	@Mock
	private FaceAnalysisRequestRepository faceAnalysisRequestRepository;

	@Mock
	private UserRepository userRepository;

	private FaceAnalysisService faceAnalysisService;

	@BeforeEach
	void setUp() {
		faceAnalysisService = new FaceAnalysisService(
				faceAnalysisRequestRepository,
				userRepository,
				new FaceAnalysisProperties(REQUEST_VALIDITY_SECONDS)
		);
	}

	@Test
	void activeUserCanCreatePendingAnalysisRequest() {
		User user = activeUser();
		FaceAnalysisRequest savedRequest = mock(FaceAnalysisRequest.class);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
		when(savedRequest.getId()).thenReturn(123L);
		when(savedRequest.getStatus()).thenReturn(FaceAnalysisStatus.PENDING);
		when(faceAnalysisRequestRepository.save(any(FaceAnalysisRequest.class)))
				.thenReturn(savedRequest);

		FaceAnalysisRequestResponse response = faceAnalysisService.createRequest(USER_ID);

		assertThat(response.analysisRequestId()).isEqualTo(123L);
		assertThat(response.status()).isEqualTo(FaceAnalysisStatus.PENDING);

		ArgumentCaptor<FaceAnalysisRequest> requestCaptor =
				ArgumentCaptor.forClass(FaceAnalysisRequest.class);
		verify(faceAnalysisRequestRepository).save(requestCaptor.capture());
		FaceAnalysisRequest createdRequest = requestCaptor.getValue();
		assertThat(createdRequest.getUserId()).isEqualTo(USER_ID);
		assertThat(createdRequest.getStatus()).isEqualTo(FaceAnalysisStatus.PENDING);
		assertThat(Duration.between(
				createdRequest.getCreatedAt(),
				createdRequest.getExpiresAt()
		)).isEqualTo(Duration.ofSeconds(REQUEST_VALIDITY_SECONDS));
	}

	@Test
	void unknownUserCannotCreateAnalysisRequest() {
		when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisService.createRequest(USER_ID),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(AuthErrorCode.UNAUTHORIZED);
		verify(faceAnalysisRequestRepository, never()).save(any());
	}

	@Test
	void inactiveUserCannotCreateAnalysisRequest() {
		User user = activeUser();
		user.withdraw(LocalDateTime.of(2026, 7, 24, 10, 0));
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisService.createRequest(USER_ID),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(UserErrorCode.INACTIVE_ACCOUNT);
		verify(faceAnalysisRequestRepository, never()).save(any());
	}

	private User activeUser() {
		return new User(
				"face-user@example.com",
				"password-hash",
				"얼굴상 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		);
	}
}
