package com.date.backend.domain.room.event;

import com.date.backend.domain.room.application.SessionTerminationService;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionTerminationRequestedEventListenerTest {
	private static final LocalDateTime ENDED_AT =
			LocalDateTime.of(2026, 7, 29, 22, 30);

	@Test
	void timerElapsedDelegatesToNormalCompletion() {
		SessionTerminationService service =
				mock(SessionTerminationService.class);
		SessionTerminationRequestedEventListener listener =
				new SessionTerminationRequestedEventListener(service);

		listener.handle(new SessionTimerElapsedEvent(15L, ENDED_AT));

		verify(service).completeByTimer(15L, ENDED_AT);
	}

	@Test
	void reconnectTimeoutDelegatesToAbnormalTermination() {
		SessionTerminationService service =
				mock(SessionTerminationService.class);
		SessionTerminationRequestedEventListener listener =
				new SessionTerminationRequestedEventListener(service);
		SessionAbnormalTerminationRequestedEvent event =
				new SessionAbnormalTerminationRequestedEvent(
						15L,
						101L,
						SessionTerminationReason.RECONNECT_TIMEOUT,
						ENDED_AT
				);

		listener.handle(event);

		verify(service).terminateForConnectionFailure(
				15L,
				SessionTerminationReason.RECONNECT_TIMEOUT,
				ENDED_AT
		);
	}
}
