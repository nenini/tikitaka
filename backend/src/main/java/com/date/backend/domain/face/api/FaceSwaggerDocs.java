package com.date.backend.domain.face.api;

import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
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

@Tag(name = "Face", description = "얼굴상 분석 요청, 결과 저장 및 조회 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface FaceSwaggerDocs {

	@Operation(
			summary = "얼굴상 분석 요청 생성",
			description = """
					인증 사용자의 얼굴상 분석 요청을 생성하고 10분 동안 유효한 analysisRequestId를 발급합니다.
					프론트엔드는 발급받은 ID와 이미지 Blob을 AI 서버에 직접 전송합니다.
					백엔드는 AI 서버를 직접 호출하거나 이미지를 저장하지 않습니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "요청 생성 성공",
					content = @Content(
							schema = @Schema(implementation = FaceAnalysisRequestResponse.class),
							examples = @ExampleObject(value = """
									{
									  "success": true,
									  "data": {
									    "analysisRequestId": 123,
									    "status": "PENDING"
									  }
									}
									""")
					)
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "비활성화 계정"
			)
	})
	ApiResponse<FaceAnalysisRequestResponse> createRequest(
			@Parameter(hidden = true) AuthUser authUser
	);
}
