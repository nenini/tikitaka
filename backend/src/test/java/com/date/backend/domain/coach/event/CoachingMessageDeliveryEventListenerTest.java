package com.date.backend.domain.coach.event;

import com.date.backend.domain.coach.domain.CoachingPriority;
import com.date.backend.domain.coach.domain.CoachingType;
import com.date.backend.domain.coach.dto.CoachingMessageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CoachingMessageDeliveryEventListenerTest {

	@Test
	void sendsCoachingOnlyToTargetUsersQueue() {
		SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
		CoachingMessageDeliveryEventListener listener =
				new CoachingMessageDeliveryEventListener(messagingTemplate);
		CoachingMessageResponse payload = new CoachingMessageResponse(
				"COACHING_MESSAGE",
				"event-1",
				15L,
				CoachingType.REACTION_PROMPT,
				"REACTION_PROMPT_01",
				"짧은 맞장구로 반응해 보세요.",
				CoachingPriority.LOW,
				"LONG_TALK",
				4_000,
				10_000
		);

		listener.handle(new CoachingMessageDeliveryEvent(101L, payload));

		verify(messagingTemplate).convertAndSendToUser(
				"101",
				"/queue/sessions/15/coaching",
				payload
		);
	}
}
