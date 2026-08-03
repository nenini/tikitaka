package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionAnalysisIngestionService;
import com.date.backend.domain.report.dto.request.SessionAnalysisRequest;
import com.date.backend.domain.report.dto.response.SessionAnalysisAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/v1/session-analyses")
public class SessionAnalysisController implements SessionAnalysisSwaggerDocs {
	private final SessionAnalysisIngestionService ingestionService;

	public SessionAnalysisController(SessionAnalysisIngestionService ingestionService) {
		this.ingestionService = ingestionService;
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<SessionAnalysisAcceptedResponse> receive(
			@Valid @RequestBody SessionAnalysisRequest request
	) {
		return ApiResponse.success(ingestionService.receive(request));
	}
}
