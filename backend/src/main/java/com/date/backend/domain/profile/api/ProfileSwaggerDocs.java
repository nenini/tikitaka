package com.date.backend.domain.profile.api;

import com.date.backend.domain.profile.dto.request.ProfileCreateRequest;
import com.date.backend.domain.profile.dto.request.ProfileUpdateRequest;
import com.date.backend.domain.profile.dto.response.OnboardingStatusResponse;
import com.date.backend.domain.profile.dto.response.ProfileResponse;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Profile", description = "사용자 프로필 등록, 조회, 수정 및 온보딩 상태 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface ProfileSwaggerDocs {

	@Operation(summary = "기본 프로필 등록", description = "인증 사용자의 닉네임, 성별, 지역을 등록합니다. 프로필 등록만으로 온보딩이 완료되지는 않습니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "등록 성공",
					content = @Content(schema = @Schema(implementation = ProfileResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 검증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "이미 등록된 프로필 또는 닉네임",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "DUPLICATE_NICKNAME",
							  "message": "이미 사용 중인 닉네임입니다."
							}
							"""))
			)
	})
	ApiResponse<ProfileResponse> create(
			@Parameter(hidden = true) AuthUser authUser,
			ProfileCreateRequest request
	);

	@Operation(summary = "내 프로필 조회", description = "인증 사용자의 프로필과 온보딩 완료 상태를 조회합니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = ProfileResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음")
	})
	ApiResponse<ProfileResponse> getMine(@Parameter(hidden = true) AuthUser authUser);

	@Operation(summary = "기본 프로필 수정", description = "닉네임, 성별, 지역 중 전달된 필드만 수정합니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "수정 성공",
					content = @Content(schema = @Schema(implementation = ProfileResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 검증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "이미 사용 중인 닉네임",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "DUPLICATE_NICKNAME",
							  "message": "이미 사용 중인 닉네임입니다."
							}
							"""))
			)
	})
	ApiResponse<ProfileResponse> update(
			@Parameter(hidden = true) AuthUser authUser,
			ProfileUpdateRequest request
	);

	@Operation(summary = "상대 공개 프로필 조회", description = "상대방의 닉네임, 성별, 지역, 만 나이를 조회합니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = PublicProfileResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 사용자 ID"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음")
	})
	ApiResponse<PublicProfileResponse> getPublicProfile(Long userId);

	@Operation(summary = "온보딩 완료 상태 조회", description = "프로필 등록, 얼굴 분석, 이상형 설문, 대화 성향 진단을 모두 완료했는지 조회합니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = OnboardingStatusResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음")
	})
	ApiResponse<OnboardingStatusResponse> getOnboardingStatus(
			@Parameter(hidden = true) AuthUser authUser
	);
}
