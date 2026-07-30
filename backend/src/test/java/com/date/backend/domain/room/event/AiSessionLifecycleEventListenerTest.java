package com.date.backend.domain.room.event;

import com.date.backend.domain.coach.integration.AiSessionEventClient;
import com.date.backend.domain.coach.integration.AiSessionEventDeliveryException;
import com.date.backend.domain.coach.integration.AiSessionEventProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Executor;

import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiSessionLifecycleEventListenerTest {
	private final Executor directExecutor = Runnable::run;

	@Test
	void deliversStartedEventAfterReceivingIt() {
		AiSessionEventClient client = mock(AiSessionEventClient.class);
		when(client.configured()).thenReturn(true);
		AiSessionLifecycleEventListener listener = listener(client, 3);
		AiSessionStartedEvent event = startedEvent();

		listener.handle(event);

		verify(client).send(event);
	}

	@Test
	void retriesRetryableDeliveryFailure() {
		AiSessionEventClient client = mock(AiSessionEventClient.class);
		when(client.configured()).thenReturn(true);
		AiSessionStartedEvent event = startedEvent();
		doThrow(new AiSessionEventDeliveryException("temporary", true))
				.doNothing()
				.when(client)
				.send(event);
		AiSessionLifecycleEventListener listener = listener(client, 3);

		listener.handle(event);

		verify(client, times(2)).send(event);
	}

	@Test
	void skipsDeliveryWhenIntegrationIsNotConfigured() {
		AiSessionEventClient client = mock(AiSessionEventClient.class);
		when(client.configured()).thenReturn(false);
		AiSessionLifecycleEventListener listener = listener(client, 3);
		AiSessionStartedEvent event = startedEvent();

		listener.handle(event);

		verify(client, never()).send(event);
	}

	private AiSessionLifecycleEventListener listener(
			AiSessionEventClient client,
			int maxAttempts
	) {
		AiSessionEventProperties properties = new AiSessionEventProperties(
				"http://localhost:8000",
				"/api/v1/sessions/events",
				Duration.ofSeconds(1),
				Duration.ofSeconds(1),
				"token",
				maxAttempts,
				Duration.ofMillis(1)
		);
		return new AiSessionLifecycleEventListener(
				client,
				properties,
				directExecutor
		);
	}

	private AiSessionStartedEvent startedEvent() {
		RoomParticipant participant = mock(RoomParticipant.class);
		when(participant.getUserId()).thenReturn(1L);
		when(participant.getParticipantIdentity()).thenReturn("user-1");
		return AiSessionStartedEvent.of(
				10L,
				Instant.parse("2026-07-30T01:00:00Z"),
				List.of(participant)
		);
	}
}
