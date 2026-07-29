package com.date.backend.domain.notification.application;

import com.date.backend.domain.match.application.MatchCancelledEvent;
import com.date.backend.domain.match.application.MatchConfirmedEvent;
import com.date.backend.domain.match.application.MatchFoundEvent;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Collection;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class MatchNotificationJobEventListenerTest {

	private static final Long PAIR_ID = 10L;
	private static final Long USER_A_ID = 101L;
	private static final Long USER_B_ID = 102L;

	private final NotificationJobSchedulingService schedulingService =
			mock(NotificationJobSchedulingService.class);
	private final MatchNotificationJobEventListener listener =
			new MatchNotificationJobEventListener(schedulingService);

	@Test
	void schedulesAcceptanceDeadlineReminderForBothParticipants() {
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime deadline = matchedAt.plusHours(8);

		listener.handleMatchFound(new MatchFoundEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				matchedAt,
				matchedAt.plusHours(10),
				deadline
		));

		verify(schedulingService).schedule(
				USER_A_ID,
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"매칭 수락 마감이 1시간 남았어요",
				"2026-07-27 18:00까지 매칭을 수락하거나 거절해 주세요.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_ACCEPTANCE_DEADLINE_SOON:10:101",
				LocalDateTime.of(2026, 7, 27, 17, 0)
		);
		verify(schedulingService).schedule(
				USER_B_ID,
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"매칭 수락 마감이 1시간 남았어요",
				"2026-07-27 18:00까지 매칭을 수락하거나 거절해 주세요.",
				NotificationReferenceType.MATCH_PAIR,
				PAIR_ID,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_ACCEPTANCE_DEADLINE_SOON:10:102",
				LocalDateTime.of(2026, 7, 27, 17, 0)
		);
	}

	@Test
	void skipsDeadlineReminderWhenOnlyOneHourCanBeAccepted() {
		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);

		listener.handleMatchFound(new MatchFoundEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				matchedAt,
				matchedAt.plusHours(2),
				matchedAt.plusHours(1)
		));

		verify(schedulingService, never()).schedule(
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any()
		);
	}

	@Test
	void confirmationCancelsDeadlineJobsAndSchedulesAllSessionReminders() {
		LocalDateTime confirmedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 27, 15, 0);

		listener.handleMatchConfirmed(new MatchConfirmedEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				confirmedAt,
				scheduledAt
		));

		verify(schedulingService).cancelPending(
				eq(NotificationReferenceType.MATCH_PAIR),
				eq(PAIR_ID),
				argThat(types -> containsOnly(
						types,
						NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON
				)),
				eq(confirmedAt)
		);
		verify(schedulingService, times(6)).schedule(
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.eq(NotificationReferenceType.MATCH_PAIR),
				org.mockito.ArgumentMatchers.eq(PAIR_ID),
				org.mockito.ArgumentMatchers.eq(
						NotificationPresentation.BELL_AND_TOAST
				),
				org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any()
		);
	}

	@Test
	void cancellationCancelsEveryPendingMatchReminder() {
		LocalDateTime cancelledAt = LocalDateTime.of(2026, 7, 27, 10, 0);

		listener.handleMatchCancelled(new MatchCancelledEvent(
				PAIR_ID,
				USER_A_ID,
				USER_B_ID,
				cancelledAt,
				false
		));

		verify(schedulingService).cancelPending(
				eq(NotificationReferenceType.MATCH_PAIR),
				eq(PAIR_ID),
				argThat(types -> types.size() == 4
						&& types.contains(NotificationType.SESSION_REMINDER_2H)
						&& types.contains(NotificationType.SESSION_REMINDER_1H)
						&& types.contains(NotificationType.SESSION_REMINDER_10M)
						&& types.contains(
						NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON
				)),
				eq(cancelledAt)
		);
	}

	private boolean containsOnly(
			Collection<NotificationType> types,
			NotificationType type
	) {
		return types.size() == 1 && types.contains(type);
	}
}
