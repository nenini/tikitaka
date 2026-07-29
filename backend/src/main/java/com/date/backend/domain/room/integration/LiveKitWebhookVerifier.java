package com.date.backend.domain.room.integration;

import com.date.backend.domain.room.config.LiveKitProperties;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import io.livekit.server.WebhookReceiver;
import livekit.LivekitWebhook.WebhookEvent;
import org.springframework.stereotype.Component;

@Component
public class LiveKitWebhookVerifier {
	private final WebhookReceiver webhookReceiver;

	public LiveKitWebhookVerifier(LiveKitProperties properties) {
		this.webhookReceiver = properties.configured()
				? new WebhookReceiver(properties.apiKey(), properties.apiSecret())
				: null;
	}

	public WebhookEvent verify(String body, String authorizationHeader) {
		if (webhookReceiver == null) {
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_NOT_CONFIGURED
			);
		}
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_UNAUTHORIZED
			);
		}

		try {
			return webhookReceiver.receive(body, authorizationHeader);
		} catch (RuntimeException exception) {
			throw new BusinessException(
					SessionErrorCode.LIVEKIT_WEBHOOK_UNAUTHORIZED
			);
		}
	}
}
