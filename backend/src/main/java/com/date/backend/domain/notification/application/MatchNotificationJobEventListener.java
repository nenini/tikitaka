package com.date.backend.domain.notification.application;

import com.date.backend.domain.match.application.MatchCancelledEvent;
import com.date.backend.domain.match.application.MatchConfirmedEvent;
import com.date.backend.domain.match.application.MatchExpiredEvent;
import com.date.backend.domain.match.application.MatchFoundEvent;
import com.date.backend.domain.match.application.MatchRejectedEvent;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.EnumSet;
import java.util.Set;

@Component
public class MatchNotificationJobEventListener {

	private static final DateTimeFormatter DATE_TIME_FORMATTER =
			DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
	private static final Set<NotificationType> ACCEPTANCE_TYPES = EnumSet.of(
			NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON
	);
	private static final Set<NotificationType> ALL_SCHEDULED_TYPES = EnumSet.of(
			NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
			NotificationType.SESSION_REMINDER_2H,
			NotificationType.SESSION_REMINDER_1H,
			NotificationType.SESSION_REMINDER_10M
	);

	private final NotificationJobSchedulingService schedulingService;

	public MatchNotificationJobEventListener(
			NotificationJobSchedulingService schedulingService
	) {
		this.schedulingService = schedulingService;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchFound(MatchFoundEvent event) {
		LocalDateTime reminderAt = event.acceptDeadlineAt().minusHours(1);
		if (!reminderAt.isAfter(event.matchedAt())) {
			return;
		}
		String content = DATE_TIME_FORMATTER.format(event.acceptDeadlineAt())
				+ "까지 매칭을 수락하거나 거절해 주세요.";
		schedule(
				event.userAId(),
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"매칭 수락 마감이 1시간 남았어요",
				content,
				event.matchPairId(),
				reminderAt
		);
		schedule(
				event.userBId(),
				NotificationType.MATCH_ACCEPTANCE_DEADLINE_SOON,
				"매칭 수락 마감이 1시간 남았어요",
				content,
				event.matchPairId(),
				reminderAt
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchConfirmed(MatchConfirmedEvent event) {
		schedulingService.cancelPending(
				NotificationReferenceType.MATCH_PAIR,
				event.matchPairId(),
				ACCEPTANCE_TYPES,
				event.confirmedAt()
		);
		scheduleSessionReminder(
				event,
				NotificationType.SESSION_REMINDER_2H,
				"화상 세션이 2시간 후 시작돼요",
				event.scheduledAt().minusHours(2)
		);
		scheduleSessionReminder(
				event,
				NotificationType.SESSION_REMINDER_1H,
				"화상 세션이 1시간 후 시작돼요",
				event.scheduledAt().minusHours(1)
		);
		scheduleSessionReminder(
				event,
				NotificationType.SESSION_REMINDER_10M,
				"화상 세션이 10분 후 시작돼요",
				event.scheduledAt().minusMinutes(10)
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchRejected(MatchRejectedEvent event) {
		cancelAll(event.matchPairId(), event.rejectedAt());
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchCancelled(MatchCancelledEvent event) {
		cancelAll(event.matchPairId(), event.cancelledAt());
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchExpired(MatchExpiredEvent event) {
		cancelAll(event.matchPairId(), event.expiredAt());
	}

	private void scheduleSessionReminder(
			MatchConfirmedEvent event,
			NotificationType type,
			String title,
			LocalDateTime reminderAt
	) {
		if (!reminderAt.isAfter(event.confirmedAt())) {
			return;
		}
		String content = DATE_TIME_FORMATTER.format(event.scheduledAt())
				+ "에 화상 세션이 시작됩니다.";
		schedule(
				event.userAId(),
				type,
				title,
				content,
				event.matchPairId(),
				reminderAt
		);
		schedule(
				event.userBId(),
				type,
				title,
				content,
				event.matchPairId(),
				reminderAt
		);
	}

	private void schedule(
			Long userId,
			NotificationType type,
			String title,
			String content,
			Long matchPairId,
			LocalDateTime scheduledAt
	) {
		schedulingService.schedule(
				userId,
				type,
				title,
				content,
				NotificationReferenceType.MATCH_PAIR,
				matchPairId,
				NotificationPresentation.BELL_AND_TOAST,
				type.name() + ":" + matchPairId + ":" + userId,
				scheduledAt
		);
	}

	private void cancelAll(Long matchPairId, LocalDateTime cancelledAt) {
		schedulingService.cancelPending(
				NotificationReferenceType.MATCH_PAIR,
				matchPairId,
				ALL_SCHEDULED_TYPES,
				cancelledAt
		);
	}
}
