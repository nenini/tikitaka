package com.date.backend.domain.report.api;

import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.report.application.VoiceSessionResultService;
import com.date.backend.domain.report.dto.request.VoiceSessionAnalysisRequest;
import com.date.backend.domain.report.dto.request.VoiceSessionReportRequest;
import com.date.backend.domain.report.dto.response.VoiceSessionResultAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/v1/voice-sessions")
public class VoiceSessionResultController implements VoiceSessionResultSwaggerDocs {
	private final VoiceSessionResultService service;
	private final AiInternalTokenVerifier tokenVerifier;

	public VoiceSessionResultController(VoiceSessionResultService service,
			AiInternalTokenVerifier tokenVerifier) {
		this.service = service;
		this.tokenVerifier = tokenVerifier;
	}

	@PostMapping(value = "/analyses", consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<VoiceSessionResultAcceptedResponse> receiveAnalysis(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody VoiceSessionAnalysisRequest request) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(service.receiveAnalysis(request));
	}

	@PostMapping(value = "/reports", consumes = MediaType.APPLICATION_JSON_VALUE)
	public ApiResponse<VoiceSessionResultAcceptedResponse> receiveReport(
			@RequestHeader("X-Internal-Token") String internalToken,
			@Valid @RequestBody VoiceSessionReportRequest request) {
		tokenVerifier.verify(internalToken);
		return ApiResponse.success(service.receiveReport(request));
	}
}
