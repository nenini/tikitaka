package com.date.backend.domain.survey.api;

import com.date.backend.domain.survey.application.SurveyService;
import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.domain.survey.dto.response.SurveyOptionsResponse;
import com.date.backend.domain.survey.dto.response.SurveyResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1")
public class SurveyController implements SurveySwaggerDocs {
	private final SurveyService surveyService;

	public SurveyController(SurveyService surveyService) {
		this.surveyService = surveyService;
	}

	@Override
	@GetMapping("/surveys/options")
	public ApiResponse<SurveyOptionsResponse> getOptions(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(surveyService.getOptions(authUser.userId()));
	}

	@Override
	@PostMapping("/users/me/survey")
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<SurveyResponse> create(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody SurveySaveRequest request
	) {
		return ApiResponse.success(surveyService.create(authUser.userId(), request));
	}

	@Override
	@GetMapping("/users/me/survey")
	public ApiResponse<SurveyResponse> getMine(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(surveyService.get(authUser.userId()));
	}

	@Override
	@PutMapping("/users/me/survey")
	public ApiResponse<SurveyResponse> update(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody SurveySaveRequest request
	) {
		return ApiResponse.success(surveyService.update(authUser.userId(), request));
	}
}
