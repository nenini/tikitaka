package com.date.backend.domain.match.domain;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MatchRequestWaitingPeriodTest {

	private final FaceTagCatalog faceTag = mock(FaceTagCatalog.class);

	@Test
	void updatingSettingsRestartsWaitingPeriod() {
		LocalDateTime initialWaitingStartedAt =
				LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime settingsUpdatedAt =
				LocalDateTime.of(2026, 7, 27, 15, 0);
		MatchRequest request = request(initialWaitingStartedAt);

		request.updateSnapshot(
				(short) 25,
				(short) 31,
				faceTag,
				faceTag,
				settingsUpdatedAt
		);

		assertThat(request.getWaitingStartedAt()).isEqualTo(settingsUpdatedAt);
	}

	@Test
	void rejectionOrExpirationRestartsWaitingPeriod() {
		LocalDateTime initialWaitingStartedAt =
				LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime matchedAt =
				LocalDateTime.of(2026, 7, 27, 11, 0);
		LocalDateTime returnedToWaitingAt =
				LocalDateTime.of(2026, 7, 27, 12, 0);
		MatchRequest request = request(initialWaitingStartedAt);
		request.markMatchFound(matchedAt);

		request.returnToWaiting(returnedToWaitingAt);

		assertThat(request.getStatus()).isEqualTo(MatchRequestStatus.WAITING);
		assertThat(request.getWaitingStartedAt()).isEqualTo(returnedToWaitingAt);
	}

	private MatchRequest request(LocalDateTime waitingStartedAt) {
		return new MatchRequest(
				1L,
				(short) 24,
				(short) 30,
				faceTag,
				faceTag,
				waitingStartedAt
		);
	}
}
