package com.date.backend.domain.admin.match.api;

import com.date.backend.domain.admin.match.dto.request.MatchingPolicyUpdateRequest;
import com.date.backend.domain.admin.match.dto.response.MatchingPolicyResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Admin Match", description = "관리자 매칭 정책 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AdminMatchingPolicySwaggerDocs {

	@Operation(summary = "매칭 정책 조회")
	@ApiResponses({
			@ApiResponse(responseCode = "200", description = "조회 성공"),
			@ApiResponse(responseCode = "401", description = "인증 필요"),
			@ApiResponse(responseCode = "403", description = "관리자 권한 필요")
	})
	com.date.backend.global.api.ApiResponse<MatchingPolicyResponse> get();

	@Operation(summary = "매칭 정책 수정", description = "매칭 가중치와 운영 시간 정책을 수정합니다.")
	@ApiResponses({
			@ApiResponse(responseCode = "200", description = "수정 성공"),
			@ApiResponse(responseCode = "400", description = "정책값 검증 실패"),
			@ApiResponse(responseCode = "401", description = "인증 필요"),
			@ApiResponse(responseCode = "403", description = "관리자 권한 필요")
	})
	com.date.backend.global.api.ApiResponse<MatchingPolicyResponse> update(
			@Parameter(hidden = true) AuthUser authUser,
			MatchingPolicyUpdateRequest request
	);
}
