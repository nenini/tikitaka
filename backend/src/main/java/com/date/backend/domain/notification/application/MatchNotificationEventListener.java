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

import java.time.format.DateTimeFormatter;

@Component
public class MatchNotificationEventListener {

	private static final DateTimeFormatter DATE_TIME_FORMATTER =
			DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

	private final NotificationCreationService notificationCreationService;

	public MatchNotificationEventListener(
			NotificationCreationService notificationCreationService
	) {
		this.notificationCreationService = notificationCreationService;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchFound(MatchFoundEvent event) {
		String content = "예정 세션은 "
				+ DATE_TIME_FORMATTER.format(event.proposedScheduledAt())
				+ "입니다. "
				+ DATE_TIME_FORMATTER.format(event.acceptDeadlineAt())
				+ "까지 수락하거나 거절해 주세요.";
		createForParticipant(
				event.userAId(),
				NotificationType.MATCH_FOUND,
				"새로운 매칭이 성립되었어요",
				content,
				event.matchPairId()
		);
		createForParticipant(
				event.userBId(),
				NotificationType.MATCH_FOUND,
				"새로운 매칭이 성립되었어요",
				content,
				event.matchPairId()
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchConfirmed(MatchConfirmedEvent event) {
		String content = "화상 세션 일정이 "
				+ DATE_TIME_FORMATTER.format(event.scheduledAt())
				+ "으로 확정되었습니다.";
		createForParticipant(
				event.userAId(),
				NotificationType.MATCH_CONFIRMED,
				"매칭이 확정되었어요",
				content,
				event.matchPairId()
		);
		createForParticipant(
				event.userBId(),
				NotificationType.MATCH_CONFIRMED,
				"매칭이 확정되었어요",
				content,
				event.matchPairId()
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchRejected(MatchRejectedEvent event) {
		createForParticipant(
				event.recipientUserId(),
				NotificationType.MATCH_REJECTED,
				"매칭이 종료되었어요",
				"상대방이 매칭을 거절하여 새로운 상대를 다시 찾습니다.",
				event.matchPairId()
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchCancelled(MatchCancelledEvent event) {
		createForParticipant(
				event.recipientUserId(),
				NotificationType.MATCH_CANCELLED,
				"확정된 매칭이 취소되었어요",
				"상대방이 매칭을 취소했습니다. 새로운 매칭을 다시 신청할 수 있습니다.",
				event.matchPairId()
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handleMatchExpired(MatchExpiredEvent event) {
		createForParticipant(
				event.userAId(),
				NotificationType.MATCH_ACCEPTANCE_EXPIRED,
				"매칭 수락 시간이 만료되었어요",
				"양측 수락이 완료되지 않아 새로운 상대를 다시 찾습니다.",
				event.matchPairId()
		);
		createForParticipant(
				event.userBId(),
				NotificationType.MATCH_ACCEPTANCE_EXPIRED,
				"매칭 수락 시간이 만료되었어요",
				"양측 수락이 완료되지 않아 새로운 상대를 다시 찾습니다.",
				event.matchPairId()
		);
	}

	private void createForParticipant(
			Long userId,
			NotificationType type,
			String title,
			String content,
			Long matchPairId
	) {
		notificationCreationService.create(
				userId,
				type,
				title,
				content,
				NotificationReferenceType.MATCH_PAIR,
				matchPairId,
				NotificationPresentation.BELL_AND_TOAST,
				type.name() + ":" + matchPairId + ":" + userId
		);
	}
}
