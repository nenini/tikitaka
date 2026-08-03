package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.ModerationReportService;
import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.response.ModerationReportResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/moderation/reports")
public class ModerationReportController implements ModerationReportSwaggerDocs {
	private final ModerationReportService reportService;

	public ModerationReportController(ModerationReportService reportService) {
		this.reportService = reportService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Override
	public ApiResponse<ModerationReportResponse> create(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody ModerationReportCreateRequest request
	) {
		return ApiResponse.success(
				reportService.create(authUser.userId(), request)
		);
	}
}
