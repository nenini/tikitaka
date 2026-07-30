package com.date.backend.domain.safety.api;

import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.safety.application.AiSafetyEventService;
import com.date.backend.domain.safety.dto.AiSafetyEventRequest;
import com.date.backend.domain.safety.dto.SafetyEventReceiptResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/ai/safety-events")
public class AiSafetyController {
	private final AiInternalTokenVerifier tokenVerifier;
	private final AiSafetyEventService safetyEventService;

	public AiSafetyController(
			AiInternalTokenVerifier tokenVerifier,
			AiSafetyEventService safetyEventService
	) {
		this.tokenVerifier = tokenVerifier;
		this.safetyEventService = safetyEventService;
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<SafetyEventReceiptResponse> receive(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiSafetyEventRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(safetyEventService.receive(request));
	}
}
