package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionQueryService;
import com.date.backend.domain.room.application.SessionLifecycleService;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
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
				mock(SessionLifecycleService.class)
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
}
