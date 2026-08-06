package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionAnalysisIngestionService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.report.dto.request.SessionAnalysisRequest;
import com.date.backend.domain.report.dto.response.SessionAnalysisAcceptedResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SessionAnalysisControllerTest {
	@Test
	void delegatesRequestBody() {
		SessionAnalysisIngestionService service = mock(SessionAnalysisIngestionService.class);
		AiInternalTokenVerifier tokenVerifier = mock(AiInternalTokenVerifier.class);
		SessionAnalysisRequest request = mock(SessionAnalysisRequest.class);
		SessionAnalysisAcceptedResponse expected =
				SessionAnalysisAcceptedResponse.accepted(1L, "analysis-v1.0.0", 2);
		when(service.receive(request)).thenReturn(expected);

		SessionAnalysisController controller = new SessionAnalysisController(service, tokenVerifier);
		var response = controller.receive("internal-token", request);

		verify(tokenVerifier).verify("internal-token");
		verify(service).receive(request);
		assertThat(response.data()).isSameAs(expected);
	}
}
