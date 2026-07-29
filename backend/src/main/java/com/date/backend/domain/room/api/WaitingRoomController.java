package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.WaitingRoomService;
import com.date.backend.domain.room.application.RoomDeviceCheckService;
import com.date.backend.domain.room.dto.request.RoomDeviceCheckRequest;
import com.date.backend.domain.room.dto.response.RoomDeviceCheckResponse;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/rooms")
public class WaitingRoomController implements WaitingRoomSwaggerDocs {
	private final WaitingRoomService waitingRoomService;
	private final RoomDeviceCheckService deviceCheckService;

	public WaitingRoomController(
			WaitingRoomService waitingRoomService,
			RoomDeviceCheckService deviceCheckService
	) {
		this.waitingRoomService = waitingRoomService;
		this.deviceCheckService = deviceCheckService;
	}

	@GetMapping("/{roomId}")
	@Override
	public ApiResponse<WaitingRoomDetailResponse> getDetail(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long roomId
	) {
		return ApiResponse.success(waitingRoomService.getDetail(authUser.userId(), roomId));
	}

	@PostMapping("/{roomId}/device-check")
	@ResponseStatus(HttpStatus.CREATED)
	@Override
	public ApiResponse<RoomDeviceCheckResponse> saveDeviceCheck(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long roomId,
			@RequestBody RoomDeviceCheckRequest request
	) {
		return ApiResponse.success(
				deviceCheckService.save(authUser.userId(), roomId, request)
		);
	}

	@GetMapping("/{roomId}/device-check")
	@Override
	public ApiResponse<RoomDeviceCheckResponse> getLatestDeviceCheck(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long roomId
	) {
		return ApiResponse.success(
				deviceCheckService.getLatest(authUser.userId(), roomId)
		);
	}
}
