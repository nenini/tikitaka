package com.date.backend.domain.coach.api;

import com.date.backend.domain.coach.application.AiAnalysisEventService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.coach.domain.AiAnalysisType;
import com.date.backend.domain.coach.dto.AiAnalysisEventRequest;
import com.date.backend.domain.coach.dto.AiAnalysisEventResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/ai/sessions/analysis-events")
public class AiAnalysisEventController {
	private final AiInternalTokenVerifier tokenVerifier;
	private final AiAnalysisEventService eventService;

	public AiAnalysisEventController(
			AiInternalTokenVerifier tokenVerifier,
			AiAnalysisEventService eventService
	) {
		this.tokenVerifier = tokenVerifier;
		this.eventService = eventService;
	}

	@PostMapping(
			value = "/voice",
			consumes = MediaType.APPLICATION_JSON_VALUE
	)
	public ApiResponse<AiAnalysisEventResponse> receiveVoiceAnalysis(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiAnalysisEventRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(eventService.receive(AiAnalysisType.VOICE, request));
	}

	@PostMapping(
			value = "/vision",
			consumes = MediaType.APPLICATION_JSON_VALUE
	)
	public ApiResponse<AiAnalysisEventResponse> receiveVisionAnalysis(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiAnalysisEventRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(eventService.receive(AiAnalysisType.VISION, request));
	}
}
