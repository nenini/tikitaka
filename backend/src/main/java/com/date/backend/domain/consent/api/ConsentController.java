package com.date.backend.domain.consent.api;

import com.date.backend.domain.consent.application.ConsentService;
import com.date.backend.domain.consent.dto.response.ConsentTypeResponse;
import com.date.backend.domain.consent.dto.response.UserConsentStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class ConsentController implements ConsentSwaggerDocs {
	private final ConsentService consentService;

	public ConsentController(ConsentService consentService) {
		this.consentService = consentService;
	}

	@Override
	@GetMapping("/consents")
	public ApiResponse<List<ConsentTypeResponse>> getActiveConsentTypes() {
		return ApiResponse.success(consentService.getActiveConsentTypes());
	}

	@Override
	@GetMapping("/users/me/consents")
	public ApiResponse<List<UserConsentStatusResponse>> getMyConsentStatuses(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(consentService.getMyConsentStatuses(authUser.userId()));
	}
}
