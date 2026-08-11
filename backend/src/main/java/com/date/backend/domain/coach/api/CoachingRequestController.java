package com.date.backend.domain.coach.api;

import com.date.backend.domain.coach.application.CoachingRequestService;
import com.date.backend.domain.coach.dto.response.CoachingRequestAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class CoachingRequestController {
	private final CoachingRequestService coachingRequestService;

	public CoachingRequestController(
			CoachingRequestService coachingRequestService
	) {
		this.coachingRequestService = coachingRequestService;
	}

	@PostMapping("/{sessionId}/coaching-requests")
	public ApiResponse<CoachingRequestAcceptedResponse> request(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				coachingRequestService.request(authUser.userId(), sessionId)
		);
	}
}
