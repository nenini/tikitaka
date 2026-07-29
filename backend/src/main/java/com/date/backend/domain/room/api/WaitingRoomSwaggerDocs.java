package com.date.backend.domain.room.api;

import com.date.backend.domain.room.dto.request.RoomDeviceCheckRequest;
import com.date.backend.domain.room.dto.response.RoomDeviceCheckResponse;
import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
import com.date.backend.domain.room.dto.response.RoomParticipantsStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;
import jakarta.validation.Valid;

@Tag(name = "Waiting Room", description = "실제 소개팅 입장 전 대기방 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface WaitingRoomSwaggerDocs {

	@Operation(
			summary = "대기방 상세 조회",
			description = """
					매칭 참여자가 대기방 상태, 참여자 요약, 예정 시각과 현재 입장 가능 여부를 조회합니다.
					LiveKit 접속 토큰은 이 API에서 노출하지 않으며 실제 입장 API에서 별도로 발급합니다.
					입장 시간이 아니어도 상세 조회는 가능하고 canEnter=false 및 entryStatus로 사유를 반환합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(
							implementation = WaitingRoomDetailResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "대기방 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "대기방이 존재하지 않음"
			)
	})
	ApiResponse<WaitingRoomDetailResponse> getDetail(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "1")
			@Positive Long roomId
	);

	@Operation(
			summary = "입장 전 기기 점검 결과 저장",
			description = """
					프론트엔드가 카메라·마이크·스피커·네트워크를 직접 점검한 뒤 결과를 저장합니다.
					서버는 장치에 직접 접근하지 않으며 네 항목이 모두 성공한 경우에만 readyAvailable=true를 반환합니다.
					재점검할 때마다 이력이 추가되고 최신 결과가 준비 완료 판단에 사용됩니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "점검 결과 저장 성공",
					content = @Content(schema = @Schema(
							implementation = RoomDeviceCheckResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "필수 점검 결과 누락"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "대기방 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "대기방이 존재하지 않음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "취소 또는 종료된 대기방"
			)
	})
	ApiResponse<RoomDeviceCheckResponse> saveDeviceCheck(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "15")
			@Positive Long roomId,
			@Valid
			@io.swagger.v3.oas.annotations.parameters.RequestBody(
					required = true,
					content = @Content(
							schema = @Schema(implementation = RoomDeviceCheckRequest.class),
							examples = @ExampleObject(value = """
									{
									  "cameraPassed": true,
									  "microphonePassed": true,
									  "speakerPassed": true,
									  "networkPassed": true
									}
									""")
					)
			)
			RoomDeviceCheckRequest request
	);

	@Operation(
			summary = "내 최신 기기 점검 결과 조회",
			description = "로그인 사용자가 해당 대기방에서 가장 최근에 수행한 기기 점검 결과를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "최신 점검 결과 조회 성공",
					content = @Content(schema = @Schema(
							implementation = RoomDeviceCheckResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "대기방 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "대기방 또는 점검 결과가 존재하지 않음"
			)
	})
	ApiResponse<RoomDeviceCheckResponse> getLatestDeviceCheck(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "15")
			@Positive Long roomId
	);

	@Operation(
			summary = "준비 완료",
			description = """
					최신 기기 점검의 카메라·마이크·스피커·네트워크 항목을 모두 통과한 참여자를 준비 완료로 변경합니다.
					이미 준비 완료 상태이면 같은 결과를 반환하는 멱등 요청이며 중복 이벤트는 발행하지 않습니다.
					상태가 변경되면 /topic/rooms/{roomId}/participants 토픽으로 전체 참여자 상태를 전송합니다.
					"""
	)
	ApiResponse<RoomParticipantsStatusResponse> markReady(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "15")
			@Positive Long roomId
	);

	@Operation(
			summary = "준비 취소",
			description = """
					현재 참여자의 준비 완료 상태를 취소합니다.
					이미 대기 상태이면 같은 결과를 반환하는 멱등 요청이며 중복 이벤트는 발행하지 않습니다.
					"""
	)
	ApiResponse<RoomParticipantsStatusResponse> cancelReady(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "15")
			@Positive Long roomId
	);

	@Operation(
			summary = "참여자 준비 상태 조회",
			description = """
					대기방 참여자별 준비 여부와 전원 준비 완료 여부를 조회합니다.
					실시간 변경은 STOMP WebSocket /ws에 연결한 뒤
					/topic/rooms/{roomId}/participants를 구독하여 받을 수 있습니다.
					"""
	)
	ApiResponse<RoomParticipantsStatusResponse> getParticipantStatuses(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "15")
			@Positive Long roomId
	);
}
