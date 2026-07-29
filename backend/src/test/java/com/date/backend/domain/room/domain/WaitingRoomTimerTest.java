package com.date.backend.domain.room.domain;

import com.date.backend.domain.match.domain.MatchPair;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WaitingRoomTimerTest {
	private static final LocalDateTime STARTED_AT =
			LocalDateTime.of(2026, 7, 29, 20, 0);

	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		MatchPair matchPair = mock(MatchPair.class);
		when(matchPair.getId()).thenReturn(30L);
		when(matchPair.getScheduledAt()).thenReturn(STARTED_AT);
		session = new WaitingRoom(matchPair);
		ReflectionTestUtils.setField(
				session,
				"status",
				RoomSessionStatus.READY
		);
		session.start(STARTED_AT);
	}

	@Test
	void expectedEndIncludesPlannedAndExtensionDuration() {
		ReflectionTestUtils.setField(session, "extensionDurationSec", 300);

		assertThat(session.expectedEndAt())
				.isEqualTo(STARTED_AT.plusMinutes(35));
	}

	@Test
	void endingSoonAndImminentNotificationsAreClaimedOnce() {
		LocalDateTime firstNoticeAt = STARTED_AT.plusMinutes(25);
		LocalDateTime finalNoticeAt = STARTED_AT.plusMinutes(29);

		assertThat(session.claimEndingSoonNotification(firstNoticeAt)).isTrue();
		assertThat(session.claimEndingSoonNotification(firstNoticeAt)).isFalse();
		assertThat(session.claimEndingImminentNotification(finalNoticeAt))
				.isTrue();
		assertThat(session.claimEndingImminentNotification(finalNoticeAt))
				.isFalse();
		assertThat(session.getEndingSoonNotifiedAt()).isEqualTo(firstNoticeAt);
		assertThat(session.getEndingImminentNotifiedAt())
				.isEqualTo(finalNoticeAt);
	}

	@Test
	void directExpirationAlsoClosesMissedWarningClaims() {
		LocalDateTime expiredAt = STARTED_AT.plusMinutes(30);

		assertThat(session.claimTimerExpiredNotification(expiredAt)).isTrue();
		assertThat(session.claimTimerExpiredNotification(expiredAt)).isFalse();
		assertThat(session.getEndingSoonNotifiedAt()).isEqualTo(expiredAt);
		assertThat(session.getEndingImminentNotifiedAt()).isEqualTo(expiredAt);
		assertThat(session.getTimerExpiredNotifiedAt()).isEqualTo(expiredAt);
	}
}
