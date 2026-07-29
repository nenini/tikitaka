package com.date.backend.domain.result.api;

import com.date.backend.domain.result.application.PeerEvaluationService;
import com.date.backend.domain.result.dto.EvaluationItemsResponse;
import com.date.backend.domain.result.dto.EvaluationStatusResponse;
import com.date.backend.domain.result.dto.PeerEvaluationResultResponse;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;

@RestController
@Validated
@RequestMapping("/api/v1/sessions/{sessionId}/evaluations")
public class PeerEvaluationController implements PeerEvaluationSwaggerDocs {
	private final PeerEvaluationService evaluationService;

	public PeerEvaluationController(PeerEvaluationService evaluationService) {
		this.evaluationService = evaluationService;
	}

	@GetMapping("/items")
	@Override
	public ApiResponse<EvaluationItemsResponse> getItems(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				evaluationService.getItems(authUser.userId(), sessionId)
		);
	}

	@GetMapping("/status")
	@Override
	public ApiResponse<EvaluationStatusResponse> getStatus(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				evaluationService.getStatus(authUser.userId(), sessionId)
		);
	}

	@PostMapping
	@Override
	public ApiResponse<PeerEvaluationSubmitResponse> submit(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@Valid @RequestBody PeerEvaluationSubmitRequest request
	) {
		return ApiResponse.success(
				evaluationService.submit(authUser.userId(), sessionId, request)
		);
	}

	@GetMapping("/result")
	@Override
	public ApiResponse<PeerEvaluationResultResponse> getResult(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				evaluationService.getResult(authUser.userId(), sessionId)
		);
	}
}
