package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.WaitingRoomService;
import com.date.backend.domain.room.application.RoomDeviceCheckService;
import com.date.backend.domain.room.domain.RoomEntryStatus;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.dto.request.RoomDeviceCheckRequest;
import com.date.backend.domain.room.dto.response.RoomDeviceCheckResponse;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class WaitingRoomControllerTest {

	@Test
	void delegatesAuthenticatedUserAndRoomIdToService() {
		WaitingRoomService service = mock(WaitingRoomService.class);
		RoomDeviceCheckService deviceCheckService = mock(RoomDeviceCheckService.class);
		WaitingRoomController controller =
				new WaitingRoomController(service, deviceCheckService);
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

	@Test
	void delegatesDeviceCheckSaveAndLatestLookupToService() {
		WaitingRoomService waitingRoomService = mock(WaitingRoomService.class);
		RoomDeviceCheckService deviceCheckService = mock(RoomDeviceCheckService.class);
		WaitingRoomController controller =
				new WaitingRoomController(waitingRoomService, deviceCheckService);
		AuthUser authUser = new AuthUser(101L, "room@example.com", UserRole.USER);
		RoomDeviceCheckRequest request =
				new RoomDeviceCheckRequest(true, true, true, true);
		RoomDeviceCheckResponse response = new RoomDeviceCheckResponse(
				31L,
				1L,
				101L,
				true,
				true,
				true,
				true,
				true,
				LocalDateTime.of(2026, 7, 29, 10, 0)
		);
		when(deviceCheckService.save(101L, 1L, request)).thenReturn(response);
		when(deviceCheckService.getLatest(101L, 1L)).thenReturn(response);

		assertThat(controller.saveDeviceCheck(authUser, 1L, request).data())
				.isEqualTo(response);
		assertThat(controller.getLatestDeviceCheck(authUser, 1L).data())
				.isEqualTo(response);
		verify(deviceCheckService).save(101L, 1L, request);
		verify(deviceCheckService).getLatest(101L, 1L);
	}

	@Test
	void swaggerInterfaceAndControllerDoNotRedefineMethodConstraints()
			throws NoSuchMethodException {
		WaitingRoomController controller = new WaitingRoomController(null, null);
		Method method = WaitingRoomController.class.getMethod(
				"saveDeviceCheck",
				AuthUser.class,
				Long.class,
				RoomDeviceCheckRequest.class
		);

		try (var validatorFactory = Validation.buildDefaultValidatorFactory()) {
			assertDoesNotThrow(() -> validatorFactory.getValidator()
					.forExecutables()
					.validateParameters(
							controller,
							method,
							new Object[]{
									null,
									1L,
									new RoomDeviceCheckRequest(true, true, true, true)
							}
					));
		}
	}
}
