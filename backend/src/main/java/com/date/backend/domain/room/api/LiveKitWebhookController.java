package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.LiveKitParticipantWebhookService;
import com.date.backend.domain.room.application.LiveKitWebhookHandlingResult;
import com.date.backend.domain.room.integration.LiveKitWebhookVerifier;
import livekit.LivekitWebhook.WebhookEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/livekit")
public class LiveKitWebhookController {
	private static final Logger log =
			LoggerFactory.getLogger(LiveKitWebhookController.class);

	private final LiveKitWebhookVerifier webhookVerifier;
	private final LiveKitParticipantWebhookService webhookService;

	public LiveKitWebhookController(
			LiveKitWebhookVerifier webhookVerifier,
			LiveKitParticipantWebhookService webhookService
	) {
		this.webhookVerifier = webhookVerifier;
		this.webhookService = webhookService;
	}

	@PostMapping(
			value = "/webhook",
			consumes = {
					"application/webhook+json",
					MediaType.APPLICATION_JSON_VALUE
			}
	)
	public ResponseEntity<Void> receive(
			@RequestHeader(
					name = "Authorization",
					required = false
			) String authorizationHeader,
			@RequestBody String body
	) {
		WebhookEvent event = webhookVerifier.verify(body, authorizationHeader);
		LiveKitWebhookHandlingResult result = webhookService.handle(event);
		log.info(
				"LiveKit webhook handled. eventId={}, type={}, room={}, "
						+ "participant={}, result={}",
				event.getId(),
				event.getEvent(),
				event.hasRoom() ? event.getRoom().getName() : null,
				event.hasParticipant()
						? event.getParticipant().getIdentity()
						: null,
				result
		);
		return ResponseEntity.ok().build();
	}
}
