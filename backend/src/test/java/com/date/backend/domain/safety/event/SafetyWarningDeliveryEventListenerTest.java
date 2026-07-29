package com.date.backend.domain.safety.event;

import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetySeverity;
import com.date.backend.domain.safety.dto.SafetyWarningResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SafetyWarningDeliveryEventListenerTest {

	@Test
	void sendsWarningOnlyToDetectedUser() {
		SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
		SafetyWarningDeliveryEventListener listener =
				new SafetyWarningDeliveryEventListener(template);
		SafetyWarningResponse payload = new SafetyWarningResponse(
				"SAFETY_WARNING",
				"safety-1",
				15L,
				SafetyCategory.PERSONAL_INFORMATION_REQUEST,
				SafetySeverity.MEDIUM,
				"완곡한 경고",
				SafetyWarningResponse.CAUTION,
				3
		);

		listener.handle(new SafetyWarningDeliveryEvent(101L, payload));

		verify(template).convertAndSendToUser(
				"101",
				"/queue/sessions/15/safety",
				payload
		);
	}
}
