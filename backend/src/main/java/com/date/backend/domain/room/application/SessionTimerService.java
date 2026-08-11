package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionTimerProperties;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTimerEventType;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.SessionTimerBroadcastEvent;
import com.date.backend.domain.room.event.SessionTimerElapsedEvent;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SessionTimerService {
	private final WaitingRoomRepository sessionRepository;
	private final SessionExtensionAgreementPolicy extensionAgreementPolicy;
	private final SessionTimerProperties properties;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	public SessionTimerService(
			WaitingRoomRepository sessionRepository,
			SessionExtensionAgreementPolicy extensionAgreementPolicy,
			SessionTimerProperties properties,
			ApplicationEventPublisher eventPublisher,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.extensionAgreementPolicy = extensionAgreementPolicy;
		this.properties = properties;
		this.eventPublisher = eventPublisher;
		this.clock = clock;
	}

	@Transactional
	public int publishTimerEvents() {
		LocalDateTime now = LocalDateTime.now(clock);
		List<WaitingRoom> sessions =
				sessionRepository.findActiveTimersForUpdate(
						RoomSessionStatus.IN_PROGRESS,
						PageRequest.of(0, properties.batchSize())
				);

		for (WaitingRoom session : sessions) {
			publishForSession(session, now);
		}
		return sessions.size();
	}

	private void publishForSession(
			WaitingRoom session,
			LocalDateTime now
	) {
		LocalDateTime endsAt = extensionAgreementPolicy.isMutuallyAgreed(
				session.getId()
		)
				? session.expectedEndAt()
				: session.extensionDecisionDeadlineAt();
		long remainingSeconds = Math.max(
				0,
				Duration.between(now, endsAt).getSeconds()
		);

		if (!now.isBefore(endsAt)) {
			if (session.claimTimerExpiredNotification(now)) {
				publish(
						SessionTimerEventType.SESSION_TIME_EXPIRED,
						session,
						0,
						endsAt,
						now
				);
				eventPublisher.publishEvent(
						new SessionTimerElapsedEvent(session.getId(), now)
				);
			}
			return;
		}

		publish(
				SessionTimerEventType.SESSION_TIMER_TICK,
				session,
				remainingSeconds,
				endsAt,
				now
		);

		if (!now.isBefore(
				endsAt.minus(properties.endingImminentBefore())
		)) {
			if (session.claimEndingImminentNotification(now)) {
				publish(
						SessionTimerEventType.SESSION_ENDING_IMMINENT,
						session,
						remainingSeconds,
						endsAt,
						now
				);
			}
			return;
		}

		if (!now.isBefore(endsAt.minus(properties.endingSoonBefore()))
				&& session.claimEndingSoonNotification(now)) {
			publish(
					SessionTimerEventType.SESSION_ENDING_SOON,
					session,
					remainingSeconds,
					endsAt,
					now
			);
		}
	}

	private void publish(
			SessionTimerEventType eventType,
			WaitingRoom session,
			long remainingSeconds,
			LocalDateTime endsAt,
			LocalDateTime now
	) {
		eventPublisher.publishEvent(
				SessionTimerBroadcastEvent.of(
						eventType,
						session.getId(),
						remainingSeconds,
						endsAt,
						now
				)
		);
	}
}
