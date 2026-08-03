package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.UserBlockService;
import com.date.backend.domain.moderation.dto.request.UserBlockCreateRequest;
import com.date.backend.domain.moderation.dto.response.UserBlockDeleteResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockListResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/users")
public class UserBlockController implements UserBlockSwaggerDocs {
	private final UserBlockService blockService;

	public UserBlockController(UserBlockService blockService) {
		this.blockService = blockService;
	}

	@PostMapping("/{userId}/blocks")
	@Override
	public ApiResponse<UserBlockResponse> block(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long userId,
			@Valid @RequestBody(required = false) UserBlockCreateRequest request
	) {
		return ApiResponse.success(
				blockService.block(authUser.userId(), userId, request)
		);
	}

	@DeleteMapping("/{userId}/blocks")
	@Override
	public ApiResponse<UserBlockDeleteResponse> unblock(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long userId
	) {
		return ApiResponse.success(
				blockService.unblock(authUser.userId(), userId)
		);
	}

	@GetMapping("/me/blocks")
	@Override
	public ApiResponse<UserBlockListResponse> getMyBlocks(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(
				blockService.getMyBlocks(authUser.userId())
		);
	}
}
