package com.date.backend.domain.room.event;

import com.date.backend.domain.coach.integration.AiSessionEventClient;
import com.date.backend.domain.coach.integration.AiSessionEventDeliveryException;
import com.date.backend.domain.coach.integration.AiSessionEventProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.concurrent.Executor;

@Component
public class AiSessionLifecycleEventListener {
	private static final Logger log = LoggerFactory.getLogger(
			AiSessionLifecycleEventListener.class
	);

	private final AiSessionEventClient client;
	private final AiSessionEventProperties properties;
	private final Executor executor;

	public AiSessionLifecycleEventListener(
			AiSessionEventClient client,
			AiSessionEventProperties properties,
			@Qualifier("aiSessionEventExecutor") Executor executor
	) {
		this.client = client;
		this.properties = properties;
		this.executor = executor;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(AiSessionStartedEvent event) {
		submit(event.eventType(), event.sessionId(), () -> client.send(event));
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(AiSessionEndedEvent event) {
		submit(event.eventType(), event.sessionId(), () -> client.send(event));
	}

	private void submit(
			String eventType,
			String sessionId,
			Runnable delivery
	) {
		if (!client.configured()) {
			log.debug(
					"AI session event delivery skipped because it is not "
							+ "configured. type={}, sessionId={}",
					eventType,
					sessionId
			);
			return;
		}
		executor.execute(() -> deliver(eventType, sessionId, delivery));
	}

	private void deliver(
			String eventType,
			String sessionId,
			Runnable delivery
	) {
		for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
			try {
				delivery.run();
				log.info(
						"AI session event delivered. type={}, sessionId={}, "
								+ "attempt={}",
						eventType,
						sessionId,
						attempt
				);
				return;
			} catch (AiSessionEventDeliveryException exception) {
				if (!exception.retryable()
						|| attempt == properties.maxAttempts()) {
					log.error(
							"AI session event delivery failed. type={}, "
									+ "sessionId={}, attempt={}",
							eventType,
							sessionId,
							attempt,
							exception
					);
					return;
				}
				log.warn(
						"AI session event delivery will retry. type={}, "
								+ "sessionId={}, attempt={}",
						eventType,
						sessionId,
						attempt
				);
				if (!waitBeforeRetry()) {
					return;
				}
			}
		}
	}

	private boolean waitBeforeRetry() {
		try {
			Thread.sleep(properties.retryDelay());
			return true;
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			return false;
		}
	}
}
