package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionQueryService;
import com.date.backend.domain.room.application.SessionLifecycleService;
import com.date.backend.domain.room.application.SessionTerminationService;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.dto.request.SessionTerminateRequest;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.domain.room.dto.response.SessionEndedResponse;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionControllerTest {

	@Test
	void delegatesAuthenticatedParticipantAndSessionId() {
		SessionQueryService service = mock(SessionQueryService.class);
		SessionController controller = new SessionController(
				service,
				mock(SessionLifecycleService.class),
				mock(SessionTerminationService.class)
		);
		AuthUser authUser =
				new AuthUser(101L, "session@example.com", UserRole.USER);
		SessionDetailResponse detail = new SessionDetailResponse(
				15L,
				30L,
				RoomSessionStatus.SCHEDULED,
				LocalDateTime.of(2026, 7, 30, 19, 0),
				null,
				null,
				1800,
				600,
				List.of()
		);
		when(service.getDetail(101L, 15L)).thenReturn(detail);

		var response = controller.getDetail(authUser, 15L);

		assertThat(response.success()).isTrue();
		assertThat(response.data()).isEqualTo(detail);
		verify(service).getDetail(101L, 15L);
	}

	@Test
	void delegatesNormalCompletionToTerminationService() {
		SessionTerminationService terminationService =
				mock(SessionTerminationService.class);
		SessionController controller = new SessionController(
				mock(SessionQueryService.class),
				mock(SessionLifecycleService.class),
				terminationService
		);
		AuthUser authUser =
				new AuthUser(101L, "session@example.com", UserRole.USER);
		LocalDateTime endedAt = LocalDateTime.of(2026, 7, 30, 20, 0);
		SessionEndedResponse ended = new SessionEndedResponse(
				SessionEndedResponse.SESSION_ENDED,
				15L,
				RoomSessionStatus.COMPLETED,
				SessionTerminationReason.NORMAL_COMPLETION,
				101L,
				endedAt
		);
		when(terminationService.complete(101L, 15L)).thenReturn(ended);

		var response = controller.complete(authUser, 15L);

		assertThat(response.data()).isEqualTo(ended);
		verify(terminationService).complete(101L, 15L);
	}

	@Test
	void delegatesEarlyTerminationReasonToTerminationService() {
		SessionTerminationService terminationService =
				mock(SessionTerminationService.class);
		SessionController controller = new SessionController(
				mock(SessionQueryService.class),
				mock(SessionLifecycleService.class),
				terminationService
		);
		AuthUser authUser =
				new AuthUser(101L, "session@example.com", UserRole.USER);
		SessionTerminateRequest request = new SessionTerminateRequest(
				SessionTerminateRequest.Reason.SAFETY_CONCERN
		);

		controller.terminate(authUser, 15L, request);

		verify(terminationService).terminate(
				101L,
				15L,
				SessionTerminationReason.SAFETY_CONCERN
		);
	}
}
