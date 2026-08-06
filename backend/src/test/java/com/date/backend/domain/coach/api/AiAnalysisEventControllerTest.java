package com.date.backend.domain.coach.api;

import com.date.backend.domain.coach.application.AiAnalysisEventService;
import com.date.backend.domain.coach.application.AiInternalTokenVerifier;
import com.date.backend.domain.coach.domain.AiAnalysisType;
import com.date.backend.domain.coach.dto.AiAnalysisEventRequest;
import com.date.backend.domain.coach.dto.AiAnalysisEventResponse;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiAnalysisEventControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AiInternalTokenVerifier tokenVerifier;

	@MockitoBean
	private AiAnalysisEventService eventService;

	@Test
	void visionPayloadObjectIsDeserializedAndForwarded() throws Exception {
		when(eventService.receive(
				eq(AiAnalysisType.VISION),
				any(AiAnalysisEventRequest.class)
		)).thenReturn(AiAnalysisEventResponse.stored("vision-event-1"));

		mockMvc.perform(post("/internal/ai/sessions/analysis-events/vision")
						.header("X-Internal-Token", "test-token")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "eventId": "vision-event-1",
								  "version": 1,
								  "eventType": "VISION_ANALYSIS",
								  "source": "AI_SESSION_SERVER",
								  "sessionId": "15",
								  "userId": "101",
								  "participantIdentity": "user-101",
								  "clientInstanceId": "client-1",
								  "seq": 1,
								  "sessionElapsedMs": 1000,
								  "confidence": 0.91,
								  "occurredAt": "2026-07-30T01:00:01Z",
								  "modelVersion": "mediapipe-face-landmarker-v1",
								  "ruleVersion": "vision-rule-v2",
								  "payload": {
								    "visionContractVersion": 4,
								    "visionEventType": "FACE_MISSING_STARTED",
								    "kind": "behavior",
								    "source": "FACE_QUALITY_DETECTOR",
								    "episodeId": "86884f97-bd78-4d78-a84d-a105d866b8cb",
								    "coachingEligible": false,
								    "baselineMode": "UNAVAILABLE",
								    "baselineEpoch": 0,
								    "details": {
								      "observedStartElapsedMs": 1000
								    }
								  }
								}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data.eventId").value("vision-event-1"))
				.andExpect(jsonPath("$.data.status").value("STORED"));

		verify(tokenVerifier).verify("test-token");

		ArgumentCaptor<AiAnalysisEventRequest> captor =
				ArgumentCaptor.forClass(AiAnalysisEventRequest.class);

		verify(eventService).receive(
				eq(AiAnalysisType.VISION),
				captor.capture()
		);

		AiAnalysisEventRequest request = captor.getValue();

		assertThat(request.payload())
				.containsEntry("visionContractVersion", 4)
				.containsEntry("visionEventType", "FACE_MISSING_STARTED")
				.containsEntry("kind", "behavior");

		Object details = request.payload().get("details");
		assertThat(details).isInstanceOf(Map.class);

		Map<?, ?> detailsMap = (Map<?, ?>) details;
		assertThat(detailsMap.get("observedStartElapsedMs")).isEqualTo(1000);
	}
}
