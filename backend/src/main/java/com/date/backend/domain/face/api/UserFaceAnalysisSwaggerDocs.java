package com.date.backend.domain.face.api;

import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
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
public interface UserFaceAnalysisSwaggerDocs {

	@Operation(
			summary = "내 최신 얼굴상 분석 결과 조회",
			description = "로그인 사용자의 가장 최근 얼굴상 분석 결과와 순위별 태그를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(
							schema = @Schema(implementation = FaceAnalysisResultResponse.class),
							examples = @ExampleObject(value = """
									{
									  "success": true,
									  "data": {
									    "analysisRequestId": 123,
									    "status": "COMPLETED",
									    "primaryType": "DOG",
									    "modelVersion": "face-type-facenet-geometry-v3-experimental",
									    "tags": [
									      {
									        "code": "DOG",
									        "rank": 1,
									        "relativeScore": 0.342118
									      }
									    ],
									    "analyzedAt": "2026-07-24T10:30:00"
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
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "저장된 얼굴상 분석 결과 없음",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "FACE_ANALYSIS_RESULT_NOT_FOUND",
							  "message": "저장된 얼굴상 분석 결과가 없습니다."
							}
							"""))
			)
	})
	ApiResponse<FaceAnalysisResultResponse> getMyLatestResult(
			@Parameter(hidden = true) AuthUser authUser
	);
}
