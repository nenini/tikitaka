package com.date.backend.domain.consent.api;

import com.date.backend.domain.consent.dto.response.ConsentTypeResponse;
import com.date.backend.domain.consent.dto.response.UserConsentStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import java.util.List;

@Tag(name = "동의", description = "서비스 동의 항목 및 사용자 동의 상태 조회 API")
public interface ConsentSwaggerDocs {

	@Operation(
			summary = "활성 동의 항목 조회",
			description = "회원가입과 얼굴 촬영 화면에서 사용할 현재 활성 동의 항목과 버전을 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
	})
	ApiResponse<List<ConsentTypeResponse>> getActiveConsentTypes();

	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(
			summary = "내 동의 상태 조회",
			description = "인증 사용자의 현재 활성 동의 항목별 동의 및 철회 상태를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
	})
	ApiResponse<List<UserConsentStatusResponse>> getMyConsentStatuses(
			@Parameter(hidden = true) AuthUser authUser
	);
}
