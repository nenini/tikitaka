package com.date.backend.domain.face.api;

import com.date.backend.domain.face.application.FaceAnalysisService;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/face-analyses")
public class FaceController implements FaceSwaggerDocs {
	private final FaceAnalysisService faceAnalysisService;

	public FaceController(FaceAnalysisService faceAnalysisService) {
		this.faceAnalysisService = faceAnalysisService;
	}

	@Override
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<FaceAnalysisRequestResponse> createRequest(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(faceAnalysisService.createRequest(authUser.userId()));
	}
}
