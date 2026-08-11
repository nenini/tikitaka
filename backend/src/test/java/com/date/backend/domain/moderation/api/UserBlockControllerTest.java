package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.UserBlockService;
import com.date.backend.domain.moderation.dto.request.UserBlockCreateRequest;
import com.date.backend.domain.moderation.dto.response.UserBlockDeleteResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockListResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockResponse;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserBlockControllerTest {
	private final UserBlockService service = mock(UserBlockService.class);
	private final UserBlockController controller =
			new UserBlockController(service);
	private final AuthUser authUser = new AuthUser(
			1L,
			"blocker@example.com",
			UserRole.USER
	);

	@Test
	void delegatesBlockRequest() {
		UserBlockCreateRequest request =
				new UserBlockCreateRequest("원치 않는 상대");
		UserBlockResponse expected = new UserBlockResponse(
				10L, 2L, request.reason(), null, false
		);
		when(service.block(1L, 2L, request)).thenReturn(expected);

		assertThat(controller.block(authUser, 2L, request).data())
				.isEqualTo(expected);
		verify(service).block(1L, 2L, request);
	}

	@Test
	void delegatesUnblockRequest() {
		UserBlockDeleteResponse expected =
				new UserBlockDeleteResponse(2L, true);
		when(service.unblock(1L, 2L)).thenReturn(expected);

		assertThat(controller.unblock(authUser, 2L).data())
				.isEqualTo(expected);
		verify(service).unblock(1L, 2L);
	}

	@Test
	void delegatesBlockListRequest() {
		UserBlockListResponse expected = new UserBlockListResponse(List.of());
		when(service.getMyBlocks(1L)).thenReturn(expected);

		assertThat(controller.getMyBlocks(authUser).data()).isEqualTo(expected);
		verify(service).getMyBlocks(1L);
	}
}
