package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionAnalysisIngestionService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
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
	private final AiInternalTokenVerifier tokenVerifier;

	public SessionAnalysisController(SessionAnalysisIngestionService ingestionService,
			AiInternalTokenVerifier tokenVerifier) {
		this.ingestionService = ingestionService;
		this.tokenVerifier = tokenVerifier;
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<SessionAnalysisAcceptedResponse> receive(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody SessionAnalysisRequest request
	) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(ingestionService.receive(request));
	}
}
