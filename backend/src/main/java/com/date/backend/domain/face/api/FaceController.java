package com.date.backend.domain.face.api;

import com.date.backend.domain.face.application.FaceAnalysisResultService;
import com.date.backend.domain.face.application.FaceAnalysisService;
import com.date.backend.domain.face.dto.request.FaceAnalysisFailureSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisFailureResponse;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/face-analyses")
public class FaceController implements FaceSwaggerDocs {
	private final FaceAnalysisService faceAnalysisService;
	private final FaceAnalysisResultService faceAnalysisResultService;

	public FaceController(
			FaceAnalysisService faceAnalysisService,
			FaceAnalysisResultService faceAnalysisResultService
	) {
		this.faceAnalysisService = faceAnalysisService;
		this.faceAnalysisResultService = faceAnalysisResultService;
	}

	@Override
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<FaceAnalysisRequestResponse> createRequest(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(faceAnalysisService.createRequest(authUser.userId()));
	}

	@Override
	@PostMapping("/{analysisRequestId}/result")
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<FaceAnalysisResultResponse> submitResult(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long analysisRequestId,
			@RequestBody FaceAnalysisResultSubmitRequest request
	) {
		return ApiResponse.success(faceAnalysisResultService.submitResult(
				authUser.userId(),
				analysisRequestId,
				request
		));
	}

	@PostMapping("/{analysisRequestId}/failure")
	public ApiResponse<FaceAnalysisFailureResponse> submitFailure(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long analysisRequestId,
			@RequestBody FaceAnalysisFailureSubmitRequest request
	) {
		return ApiResponse.success(faceAnalysisService.submitFailure(
				authUser.userId(),
				analysisRequestId,
				request
		));
	}
}
