package com.date.backend.domain.silence.event;

import com.date.backend.domain.silence.domain.SilenceInterventionStage;
import com.date.backend.domain.silence.dto.ContextualQuestionRecommendationResponse;
import com.date.backend.domain.silence.dto.SilenceInterventionResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SilenceEventListenerTest {

	@Test
	void broadcastsSilenceInterventionToSessionParticipants() {
		SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
		SilenceInterventionEventListener listener =
				new SilenceInterventionEventListener(template);
		SilenceInterventionResponse payload = new SilenceInterventionResponse(
				"SILENCE_INTERVENTION",
				"silence-1",
				15L,
				30_000,
				SilenceInterventionStage.QUESTION_CARD,
				List.of()
		);

		listener.handle(new SilenceInterventionEvent(payload));

		verify(template).convertAndSend("/topic/sessions/15/silence", payload);
	}

	@Test
	void sendsContextualQuestionsOnlyToTargetUser() {
		SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
		ContextualQuestionDeliveryEventListener listener =
				new ContextualQuestionDeliveryEventListener(template);
		ContextualQuestionRecommendationResponse payload =
				new ContextualQuestionRecommendationResponse(
						"CONTEXTUAL_QUESTION_RECOMMENDATION",
						"question-1",
						15L,
						List.of("질문1", "질문2", "질문3"),
						60_000
				);

		listener.handle(new ContextualQuestionDeliveryEvent(101L, payload));

		verify(template).convertAndSendToUser(
				"101",
				"/queue/sessions/15/questions",
				payload
		);
	}
}
