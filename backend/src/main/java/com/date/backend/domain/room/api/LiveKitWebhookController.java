package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.LiveKitParticipantWebhookService;
import com.date.backend.domain.room.integration.LiveKitWebhookVerifier;
import livekit.LivekitWebhook.WebhookEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/livekit")
public class LiveKitWebhookController {
	private final LiveKitWebhookVerifier webhookVerifier;
	private final LiveKitParticipantWebhookService webhookService;

	public LiveKitWebhookController(
			LiveKitWebhookVerifier webhookVerifier,
			LiveKitParticipantWebhookService webhookService
	) {
		this.webhookVerifier = webhookVerifier;
		this.webhookService = webhookService;
	}

	@PostMapping("/webhook")
	public ResponseEntity<Void> receive(
			@RequestHeader(
					name = "Authorization",
					required = false
			) String authorizationHeader,
			@RequestBody String body
	) {
		WebhookEvent event = webhookVerifier.verify(body, authorizationHeader);
		webhookService.handle(event);
		return ResponseEntity.ok().build();
	}
}
