package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.AiReportResultService;
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
	public AiReportResultController(AiReportResultService resultService) { this.resultService = resultService; }

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<AiReportResultAcceptedResponse> receive(
			@Valid @RequestBody AiReportResultRequest request) {
		return ApiResponse.success(resultService.receive(request));
	}
}
