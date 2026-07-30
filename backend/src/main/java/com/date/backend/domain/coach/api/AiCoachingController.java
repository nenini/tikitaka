package com.date.backend.domain.coach.api;

import com.date.backend.domain.coach.application.AiCoachingService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.coach.dto.AiCoachingReceiptResponse;
import com.date.backend.domain.coach.dto.AiCoachingRequest;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/ai/coaching-events")
public class AiCoachingController {
	private final AiInternalTokenVerifier tokenVerifier;
	private final AiCoachingService coachingService;

	public AiCoachingController(
			AiInternalTokenVerifier tokenVerifier,
			AiCoachingService coachingService
	) {
		this.tokenVerifier = tokenVerifier;
		this.coachingService = coachingService;
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<AiCoachingReceiptResponse> receive(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiCoachingRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(coachingService.receive(request));
	}
}
