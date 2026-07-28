package com.date.backend.domain.notification.application;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class NotificationSseEmitterFactory {

	public SseEmitter create(long timeoutMs) {
		return new SseEmitter(timeoutMs);
	}
}
