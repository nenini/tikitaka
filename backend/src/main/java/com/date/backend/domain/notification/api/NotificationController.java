package com.date.backend.domain.notification.api;

import com.date.backend.domain.notification.application.NotificationQueryService;
import com.date.backend.domain.notification.application.NotificationCommandService;
import com.date.backend.domain.notification.dto.response.NotificationListResponse;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import com.date.backend.domain.notification.dto.response.ReadAllNotificationsResponse;
import com.date.backend.domain.notification.dto.response.UnreadNotificationCountResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/notifications")
public class NotificationController implements NotificationSwaggerDocs {

	private final NotificationQueryService queryService;
	private final NotificationCommandService commandService;

	public NotificationController(
			NotificationQueryService queryService,
			NotificationCommandService commandService
	) {
		this.queryService = queryService;
		this.commandService = commandService;
	}

	@Override
	@GetMapping
	public ApiResponse<NotificationListResponse> getNotifications(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestParam(required = false) Long cursor,
			@RequestParam(defaultValue = "20") int size
	) {
		return ApiResponse.success(
				queryService.getNotifications(authUser.userId(), cursor, size)
		);
	}

	@Override
	@GetMapping("/unread-count")
	public ApiResponse<UnreadNotificationCountResponse> getUnreadCount(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(
				queryService.getUnreadCount(authUser.userId())
		);
	}

	@Override
	@PatchMapping("/{notificationId}/read")
	public ApiResponse<NotificationResponse> read(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long notificationId
	) {
		return ApiResponse.success(
				commandService.read(authUser.userId(), notificationId)
		);
	}

	@Override
	@PatchMapping("/read-all")
	public ApiResponse<ReadAllNotificationsResponse> readAll(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(commandService.readAll(authUser.userId()));
	}
}
