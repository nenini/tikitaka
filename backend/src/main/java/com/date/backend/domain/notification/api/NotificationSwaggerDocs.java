package com.date.backend.domain.notification.api;

import com.date.backend.domain.notification.dto.response.NotificationListResponse;
import com.date.backend.domain.notification.dto.response.UnreadNotificationCountResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;

@Tag(name = "Notification", description = "개인 알림 조회 및 읽음 처리 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface NotificationSwaggerDocs {

	@Operation(
			summary = "알림 목록 조회",
			description = """
					로그인 사용자의 알림을 최신순으로 조회합니다.
					첫 요청에서는 cursor를 생략하고, 다음 페이지는 응답의 nextCursor를 전달합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(
							implementation = NotificationListResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "잘못된 커서 또는 조회 크기"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			)
	})
	ApiResponse<NotificationListResponse> getNotifications(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(
					description = "이전 응답의 nextCursor. 첫 조회 시 생략",
					example = "101"
			)
			@Positive Long cursor,
			@Parameter(description = "조회 개수(1~100)", example = "20")
			@Min(1) @Max(100) int size
	);

	@Operation(
			summary = "미확인 알림 개수 조회",
			description = "로그인 사용자가 아직 읽지 않은 알림의 총개수를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(
							implementation = UnreadNotificationCountResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			)
	})
	ApiResponse<UnreadNotificationCountResponse> getUnreadCount(
			@Parameter(hidden = true) AuthUser authUser
	);
}
