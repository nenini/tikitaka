package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.AiReportResultService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.report.dto.request.AiReportResultRequest;
import com.date.backend.domain.report.dto.response.AiReportResultAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/v1/session-reports/results")
public class AiReportResultController implements AiReportResultSwaggerDocs {
	private final AiReportResultService resultService;
	private final AiInternalTokenVerifier tokenVerifier;
	public AiReportResultController(AiReportResultService resultService,
			AiInternalTokenVerifier tokenVerifier) {
		this.resultService = resultService;
		this.tokenVerifier = tokenVerifier;
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<AiReportResultAcceptedResponse> receive(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody AiReportResultRequest request) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(resultService.receive(request));
	}
}
