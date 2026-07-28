package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.WaitingRoomService;
import com.date.backend.domain.room.domain.RoomEntryStatus;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WaitingRoomControllerTest {

	@Test
	void delegatesAuthenticatedUserAndRoomIdToService() {
		WaitingRoomService service = mock(WaitingRoomService.class);
		WaitingRoomController controller = new WaitingRoomController(service);
		AuthUser authUser = new AuthUser(101L, "room@example.com", UserRole.USER);
		LocalDateTime scheduledAt = LocalDateTime.of(2026, 7, 28, 19, 0);
		WaitingRoomDetailResponse detail = new WaitingRoomDetailResponse(
				1L,
				2L,
				RoomSessionStatus.SCHEDULED,
				scheduledAt,
				scheduledAt.minusMinutes(10),
				scheduledAt.plusMinutes(10),
				true,
				RoomEntryStatus.AVAILABLE,
				List.of()
		);
		when(service.getDetail(101L, 1L)).thenReturn(detail);

		var response = controller.getDetail(authUser, 1L);

		assertThat(response.success()).isTrue();
		assertThat(response.data()).isEqualTo(detail);
		verify(service).getDetail(101L, 1L);
	}
}
