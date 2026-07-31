package com.date.backend.domain.contact.api;

import com.date.backend.domain.contact.application.SessionExtensionDecisionService;
import com.date.backend.domain.contact.domain.ContactDecision;
import com.date.backend.domain.contact.domain.ContactDecisionStatus;
import com.date.backend.domain.contact.dto.request.SessionExtensionDecisionRequest;
import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContactControllerTest {

	@Test
	void delegatesAuthenticatedParticipantDecision() {
		SessionExtensionDecisionService service = mock(
				SessionExtensionDecisionService.class
		);
		ContactController controller = new ContactController(service);
		AuthUser authUser = new AuthUser(
				101L,
				"participant@example.com",
				UserRole.USER
		);
		LocalDateTime now = LocalDateTime.of(2026, 7, 31, 20, 31);
		SessionExtensionDecisionResponse expected =
				new SessionExtensionDecisionResponse(
						SessionExtensionDecisionResponse.EVENT_TYPE,
						15L,
						ContactDecisionStatus.PENDING,
						101L,
						ContactDecision.AGREE,
						202L,
						null,
						RoomSessionStatus.IN_PROGRESS,
						LocalDateTime.of(2026, 7, 31, 20, 35),
						null,
						now
				);
		when(service.decide(101L, 15L, ContactDecision.AGREE))
				.thenReturn(expected);

		var response = controller.decideExtension(
				authUser,
				15L,
				new SessionExtensionDecisionRequest(ContactDecision.AGREE)
		);

		assertThat(response.data()).isEqualTo(expected);
		verify(service).decide(101L, 15L, ContactDecision.AGREE);
	}
}
