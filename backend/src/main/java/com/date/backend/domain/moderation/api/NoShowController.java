package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.NoShowService;
import com.date.backend.domain.moderation.dto.response.NoShowResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class NoShowController implements NoShowSwaggerDocs {
	private final NoShowService noShowService;
	public NoShowController(NoShowService noShowService) { this.noShowService = noShowService; }

	@PostMapping("/{sessionId}/no-show")
	@Override
	public ApiResponse<NoShowResponse> record(@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long sessionId) {
		return ApiResponse.success(noShowService.record(authUser.userId(), sessionId));
	}
}
