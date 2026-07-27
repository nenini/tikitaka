package com.date.backend.domain.match.api;

import com.date.backend.domain.match.application.MatchResultService;
import com.date.backend.domain.match.dto.response.MatchResultResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/matches")
public class MatchController {

	private final MatchResultService matchResultService;

	public MatchController(MatchResultService matchResultService) {
		this.matchResultService = matchResultService;
	}

	@GetMapping("/me/current")
	public ApiResponse<MatchResultResponse> getCurrent(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(matchResultService.getCurrent(authUser.userId()));
	}

	@PostMapping("/{matchPairId}/accept")
	public ApiResponse<MatchResultResponse> accept(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long matchPairId
	) {
		return ApiResponse.success(
				matchResultService.accept(matchPairId, authUser.userId())
		);
	}

	@PostMapping("/{matchPairId}/reject")
	public ApiResponse<MatchResultResponse> reject(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long matchPairId
	) {
		return ApiResponse.success(
				matchResultService.reject(matchPairId, authUser.userId())
		);
	}
}
