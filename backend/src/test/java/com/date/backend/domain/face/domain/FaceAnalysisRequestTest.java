package com.date.backend.domain.face.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class FaceAnalysisRequestTest {

	private static final Long USER_ID = 1L;
	private static final LocalDateTime CREATED_AT = LocalDateTime.of(2026, 7, 24, 10, 0);
	private static final LocalDateTime EXPIRES_AT = CREATED_AT.plusMinutes(10);

	@Test
	void analysisRequestStartsInPendingStatus() {
		FaceAnalysisRequest request = createRequest();

		assertThat(request.getUserId()).isEqualTo(USER_ID);
		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.PENDING);
		assertThat(request.getCreatedAt()).isEqualTo(CREATED_AT);
		assertThat(request.getExpiresAt()).isEqualTo(EXPIRES_AT);
		assertThat(request.getFailureCode()).isNull();
		assertThat(request.getCompletedAt()).isNull();
		assertThat(request.getFailedAt()).isNull();
	}

	@Test
	void expirationMustBeAfterCreation() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new FaceAnalysisRequest(USER_ID, CREATED_AT, CREATED_AT));
	}

	@Test
	void ownerCanBeValidated() {
		FaceAnalysisRequest request = createRequest();

		request.validateOwner(USER_ID);

		assertThatIllegalArgumentException()
				.isThrownBy(() -> request.validateOwner(2L));
	}

	@Test
	void expirationIncludesExactExpirationTime() {
		FaceAnalysisRequest request = createRequest();

		assertThat(request.isExpiredAt(EXPIRES_AT.minusNanos(1))).isFalse();
		assertThat(request.isExpiredAt(EXPIRES_AT)).isTrue();
	}

	@Test
	void pendingRequestCanBeCompletedBeforeExpiration() {
		FaceAnalysisRequest request = createRequest();
		LocalDateTime completedAt = EXPIRES_AT.minusSeconds(1);

		request.complete(completedAt);

		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.COMPLETED);
		assertThat(request.getCompletedAt()).isEqualTo(completedAt);
	}

	@Test
	void pendingRequestCanFailBeforeExpiration() {
		FaceAnalysisRequest request = createRequest();
		LocalDateTime failedAt = EXPIRES_AT.minusSeconds(1);

		request.fail(FaceAnalysisFailureCode.NO_FACE, failedAt);

		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.FAILED);
		assertThat(request.getFailureCode()).isEqualTo(FaceAnalysisFailureCode.NO_FACE);
		assertThat(request.getFailedAt()).isEqualTo(failedAt);
	}

	@Test
	void expiredRequestCanBeMarkedExpired() {
		FaceAnalysisRequest request = createRequest();

		request.expire(EXPIRES_AT);

		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.EXPIRED);
	}

	@Test
	void requestCannotExpireBeforeExpirationTime() {
		FaceAnalysisRequest request = createRequest();

		assertThatIllegalStateException()
				.isThrownBy(() -> request.expire(EXPIRES_AT.minusNanos(1)));
		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.PENDING);
	}

	@Test
	void terminalRequestCannotBeProcessedAgain() {
		FaceAnalysisRequest request = createRequest();
		request.complete(EXPIRES_AT.minusSeconds(1));

		assertThatIllegalStateException()
				.isThrownBy(() -> request.fail(FaceAnalysisFailureCode.NO_FACE, EXPIRES_AT.minusNanos(1)));
	}

	@Test
	void expiredRequestCannotBeCompleted() {
		FaceAnalysisRequest request = createRequest();

		assertThatIllegalStateException()
				.isThrownBy(() -> request.complete(EXPIRES_AT));
		assertThat(request.getStatus()).isEqualTo(FaceAnalysisStatus.PENDING);
	}

	private FaceAnalysisRequest createRequest() {
		return new FaceAnalysisRequest(USER_ID, CREATED_AT, EXPIRES_AT);
	}
}
