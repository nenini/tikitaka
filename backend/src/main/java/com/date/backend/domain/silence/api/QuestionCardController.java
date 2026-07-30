package com.date.backend.domain.silence.api;

import com.date.backend.domain.silence.application.QuestionCardService;
import com.date.backend.domain.silence.dto.QuestionCardListResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class QuestionCardController {
	private final QuestionCardService questionCardService;

	public QuestionCardController(QuestionCardService questionCardService) {
		this.questionCardService = questionCardService;
	}

	@GetMapping("/{sessionId}/question-cards")
	public ApiResponse<QuestionCardListResponse> getQuestionCards(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@RequestParam(defaultValue = "3") @Min(1) @Max(5) int limit
	) {
		return ApiResponse.success(questionCardService.getRandomQuestions(
				authUser.userId(),
				sessionId,
				limit
		));
	}
}
