package com.date.backend.domain.contact.api;

import com.date.backend.domain.contact.application.SessionExtensionDecisionService;
import com.date.backend.domain.contact.dto.request.SessionExtensionDecisionRequest;
import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class ContactController implements ContactSwaggerDocs {
	private final SessionExtensionDecisionService decisionService;

	public ContactController(
			SessionExtensionDecisionService decisionService
	) {
		this.decisionService = decisionService;
	}

	@PostMapping("/{sessionId}/extensions")
	@Override
	public ApiResponse<SessionExtensionDecisionResponse> decideExtension(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@Valid @RequestBody SessionExtensionDecisionRequest request
	) {
		return ApiResponse.success(decisionService.decide(
				authUser.userId(),
				sessionId,
				request.decision()
		));
	}
}
