package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationSseProperties;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import com.date.backend.domain.notification.dto.response.NotificationSseConnectedResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NotificationSseService {

	private static final String CONNECTED_EVENT = "connected";
	private static final String NOTIFICATION_EVENT = "notification";

	private final Map<Long, Map<String, SseEmitter>> emitters =
			new ConcurrentHashMap<>();
	private final NotificationSseEmitterFactory emitterFactory;
	private final NotificationSseProperties properties;
	private final Clock clock;

	public NotificationSseService(
			NotificationSseEmitterFactory emitterFactory,
			NotificationSseProperties properties,
			Clock clock
	) {
		this.emitterFactory = emitterFactory;
		this.properties = properties;
		this.clock = clock;
	}

	public SseEmitter subscribe(Long userId) {
		String connectionId = UUID.randomUUID().toString();
		SseEmitter emitter = emitterFactory.create(properties.timeoutMs());
		emitters.computeIfAbsent(userId, ignored -> new ConcurrentHashMap<>())
				.put(connectionId, emitter);
		emitter.onCompletion(() -> remove(userId, connectionId));
		emitter.onTimeout(() -> {
			remove(userId, connectionId);
			emitter.complete();
		});
		emitter.onError(error -> remove(userId, connectionId));

		try {
			emitter.send(SseEmitter.event()
					.name(CONNECTED_EVENT)
					.reconnectTime(properties.retryMs())
					.data(new NotificationSseConnectedResponse(
							userId,
							LocalDateTime.now(clock)
					)));
		} catch (IOException | IllegalStateException exception) {
			remove(userId, connectionId);
			emitter.completeWithError(exception);
		}
		return emitter;
	}

	public void sendNotification(
			Long userId,
			NotificationResponse notification
	) {
		sendToUser(
				userId,
				SseEmitter.event()
						.id(notification.notificationId().toString())
						.name(NOTIFICATION_EVENT)
						.data(notification)
		);
	}

	public void sendHeartbeat() {
		emitters.keySet().forEach(userId -> sendToUser(
				userId,
				SseEmitter.event().comment("heartbeat")
		));
	}

	public void disconnect(Long userId) {
		Map<String, SseEmitter> removed = emitters.remove(userId);
		if (removed == null) {
			return;
		}
		List.copyOf(removed.values()).forEach(SseEmitter::complete);
	}

	private void sendToUser(
			Long userId,
			SseEmitter.SseEventBuilder event
	) {
		Map<String, SseEmitter> userEmitters = emitters.get(userId);
		if (userEmitters == null) {
			return;
		}
		userEmitters.forEach((connectionId, emitter) -> {
			try {
				emitter.send(event);
			} catch (IOException | IllegalStateException exception) {
				remove(userId, connectionId);
				emitter.complete();
			}
		});
	}

	private void remove(Long userId, String connectionId) {
		emitters.computeIfPresent(userId, (ignored, userEmitters) -> {
			userEmitters.remove(connectionId);
			return userEmitters.isEmpty() ? null : userEmitters;
		});
	}
}
