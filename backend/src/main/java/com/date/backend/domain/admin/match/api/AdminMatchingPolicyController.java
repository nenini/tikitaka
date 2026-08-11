package com.date.backend.domain.admin.match.api;

import com.date.backend.domain.admin.match.application.AdminMatchingPolicyService;
import com.date.backend.domain.admin.match.dto.request.MatchingPolicyUpdateRequest;
import com.date.backend.domain.admin.match.dto.response.MatchingPolicyResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/matching-policy")
public class AdminMatchingPolicyController implements AdminMatchingPolicySwaggerDocs {

	private final AdminMatchingPolicyService service;

	public AdminMatchingPolicyController(AdminMatchingPolicyService service) {
		this.service = service;
	}

	@Override
	@GetMapping
	public ApiResponse<MatchingPolicyResponse> get() {
		return ApiResponse.success(service.get());
	}

	@Override
	@PatchMapping
	public ApiResponse<MatchingPolicyResponse> update(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody MatchingPolicyUpdateRequest request
	) {
		return ApiResponse.success(service.update(authUser.userId(), request));
	}
}
