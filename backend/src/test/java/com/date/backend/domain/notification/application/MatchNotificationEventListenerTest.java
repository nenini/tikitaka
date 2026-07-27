package com.date.backend.domain.notification.application;

import com.date.backend.domain.match.application.MatchCancelledEvent;
import com.date.backend.domain.match.application.MatchConfirmedEvent;
import com.date.backend.domain.match.application.MatchFoundEvent;
import com.date.backend.domain.match.application.MatchRejectedEvent;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MatchNotificationEventListenerTest {

	private static final Long PAIR_ID = 10L;
	private static final Long USER_A_ID = 101L;
	private static final Long USER_B_ID = 102L;

	private final NotificationCreationService creationService =
			mock(NotificationCreationService.class);
	private final MatchNotificationEventListener listener =
			new MatchNotificationEventListener(creationService);

	@Test
	void createsMatchFoundNotificationForBothParticipants() {
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime deadline = matchedAt.plusMinutes(5);

		listener.handleMatchFound(new MatchFoundEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				matchedAt,
				deadline
		));

		verify(creationService).create(
				USER_A_ID,
				NotificationType.MATCH_FOUND,
				"새로운 매칭이 성립되었어요",
				"새로운 매칭이 성립되었습니다. 2026-07-27 10:05까지 수락하거나 거절해 주세요.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:10:101"
		);
		verify(creationService).create(
				USER_B_ID,
				NotificationType.MATCH_FOUND,
				"새로운 매칭이 성립되었어요",
				"새로운 매칭이 성립되었습니다. 2026-07-27 10:05까지 수락하거나 거절해 주세요.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:10:102"
		);
	}

	@Test
	void createsConfirmedNotificationForBothParticipants() {
		LocalDateTime confirmedAt = LocalDateTime.of(2026, 7, 27, 10, 2);
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 27, 20, 0);

		listener.handleMatchConfirmed(new MatchConfirmedEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				confirmedAt,
				scheduledAt
		));

		verify(creationService).create(
				USER_A_ID,
				NotificationType.MATCH_CONFIRMED,
				"매칭이 확정되었어요",
				"화상 세션 일정이 2026-07-27 20:00으로 확정되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_CONFIRMED:10:101"
		);
		verify(creationService).create(
				USER_B_ID,
				NotificationType.MATCH_CONFIRMED,
				"매칭이 확정되었어요",
				"화상 세션 일정이 2026-07-27 20:00으로 확정되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_CONFIRMED:10:102"
		);
	}

	@Test
	void createsRejectedNotificationOnlyForPartner() {
		listener.handleMatchRejected(new MatchRejectedEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				LocalDateTime.of(2026, 7, 27, 10, 3)
		));

		verify(creationService).create(
				USER_B_ID,
				NotificationType.MATCH_REJECTED,
				"매칭이 종료되었어요",
				"상대방이 매칭을 거절하여 새로운 상대를 다시 찾습니다.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_REJECTED:10:102"
		);
	}

	@Test
	void createsCancelledNotificationOnlyForPartner() {
		listener.handleMatchCancelled(new MatchCancelledEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				LocalDateTime.of(2026, 7, 27, 10, 3),
				false
		));

		verify(creationService).create(
				USER_B_ID,
				NotificationType.MATCH_CANCELLED,
				"확정된 매칭이 취소되었어요",
				"상대방이 매칭을 취소했습니다. 새로운 매칭을 다시 신청할 수 있습니다.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_CANCELLED:10:102"
		);
	}
}
