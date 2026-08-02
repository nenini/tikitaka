package com.date.backend.domain.silence.api;

import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.silence.application.AiQuestionRecommendationService;
import com.date.backend.domain.silence.application.AiSilenceEventService;
import com.date.backend.domain.silence.dto.AiQuestionRecommendationRequest;
import com.date.backend.domain.silence.dto.AiSilenceEventRequest;
import com.date.backend.domain.silence.dto.QuestionRecommendationReceiptResponse;
import com.date.backend.domain.silence.dto.SilenceEventReceiptResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/ai")
public class AiSilenceController {
	private final AiInternalTokenVerifier tokenVerifier;
	private final AiSilenceEventService silenceEventService;
	private final AiQuestionRecommendationService recommendationService;

	public AiSilenceController(
			AiInternalTokenVerifier tokenVerifier,
			AiSilenceEventService silenceEventService,
			AiQuestionRecommendationService recommendationService
	) {
		this.tokenVerifier = tokenVerifier;
		this.silenceEventService = silenceEventService;
		this.recommendationService = recommendationService;
	}

	@PostMapping(
			value = "/silence-events",
			consumes = MediaType.APPLICATION_JSON_VALUE
	)
	public ApiResponse<SilenceEventReceiptResponse> receiveSilence(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiSilenceEventRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(silenceEventService.receive(request));
	}

	@PostMapping(
			value = "/question-recommendations",
			consumes = MediaType.APPLICATION_JSON_VALUE
	)
	public ApiResponse<QuestionRecommendationReceiptResponse> receiveRecommendation(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiQuestionRecommendationRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(recommendationService.receive(request));
	}
}
