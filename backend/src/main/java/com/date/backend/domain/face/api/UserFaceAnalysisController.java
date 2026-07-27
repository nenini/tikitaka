package com.date.backend.domain.face.api;

import com.date.backend.domain.face.application.FaceAnalysisResultService;
import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me/face-analysis")
public class UserFaceAnalysisController implements UserFaceAnalysisSwaggerDocs {
	private final FaceAnalysisResultService faceAnalysisResultService;

	public UserFaceAnalysisController(
			FaceAnalysisResultService faceAnalysisResultService
	) {
		this.faceAnalysisResultService = faceAnalysisResultService;
	}

	@Override
	@GetMapping
	public ApiResponse<FaceAnalysisResultResponse> getMyLatestResult(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(
				faceAnalysisResultService.getMyLatestResult(authUser.userId())
		);
	}
}
