package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.WaitingRoomService;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/rooms")
public class WaitingRoomController implements WaitingRoomSwaggerDocs {
	private final WaitingRoomService waitingRoomService;

	public WaitingRoomController(WaitingRoomService waitingRoomService) {
		this.waitingRoomService = waitingRoomService;
	}

	@GetMapping("/{roomId}")
	@Override
	public ApiResponse<WaitingRoomDetailResponse> getDetail(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long roomId
	) {
		return ApiResponse.success(waitingRoomService.getDetail(authUser.userId(), roomId));
	}
}
