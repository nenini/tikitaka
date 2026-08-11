package com.date.backend.domain.match.api;

import com.date.backend.domain.match.application.MatchRequestService;
import com.date.backend.domain.match.dto.request.MatchRequestCancelRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSaveRequest;
import com.date.backend.domain.match.dto.response.MatchRequestResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/match-requests")
public class MatchRequestController implements MatchRequestSwaggerDocs {
	private final MatchRequestService matchRequestService;

	public MatchRequestController(MatchRequestService matchRequestService) {
		this.matchRequestService = matchRequestService;
	}

	@Override
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<MatchRequestResponse> create(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody MatchRequestSaveRequest request
	) {
		return ApiResponse.success(
				matchRequestService.create(authUser.userId(), request)
		);
	}

	@Override
	@GetMapping("/me/current")
	public ApiResponse<MatchRequestResponse> getCurrent(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(
				matchRequestService.getCurrent(authUser.userId())
		);
	}

	@Override
	@PutMapping("/me/current")
	public ApiResponse<MatchRequestResponse> update(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody MatchRequestSaveRequest request
	) {
		return ApiResponse.success(
				matchRequestService.update(authUser.userId(), request)
		);
	}

	@Override
	@DeleteMapping("/me/current")
	public ApiResponse<Void> cancel(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody(required = false) MatchRequestCancelRequest request
	) {
		matchRequestService.cancel(authUser.userId(), request);
		return ApiResponse.successWithoutData();
	}
}
