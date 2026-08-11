package com.date.backend.domain.room.event;

import com.date.backend.domain.room.application.SessionTerminationService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SessionTerminationRequestedEventListener {
	private final SessionTerminationService terminationService;

	public SessionTerminationRequestedEventListener(
			SessionTerminationService terminationService
	) {
		this.terminationService = terminationService;
	}

	@TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
	public void handle(SessionTimerElapsedEvent event) {
		terminationService.completeByTimer(
				event.sessionId(),
				event.elapsedAt()
		);
	}

	@TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
	public void handle(SessionAbnormalTerminationRequestedEvent event) {
		terminationService.terminateForConnectionFailure(
				event.sessionId(),
				event.reason(),
				event.requestedAt()
		);
	}
}
