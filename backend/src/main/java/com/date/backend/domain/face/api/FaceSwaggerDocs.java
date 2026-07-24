package com.date.backend.domain.face.api;

import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisRequestResponse;
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
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;

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

	@Operation(
			summary = "얼굴상 분석 성공 결과 제출",
			description = """
					프론트엔드가 AI 서버에서 받은 얼굴상 분석 결과를 저장합니다.
					요청 소유자, PENDING 상태, 10분 만료 여부를 확인하고 결과 이력과 사용자의 최신 얼굴상 태그를 함께 저장합니다.
					태그의 relativeScore는 상대 점수이므로 합계가 1일 필요는 없습니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "결과 저장 성공",
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
					responseCode = "400",
					description = "결과 형식 오류 또는 사용자 성별에 적용할 수 없는 얼굴상",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "INVALID_FACE_ANALYSIS_RESULT",
							  "message": "유효하지 않은 얼굴상 분석 결과입니다."
							}
							"""))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "요청 소유자 불일치 또는 비활성화 계정"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "분석 요청 또는 프로필 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "이미 처리된 분석 요청"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "410",
					description = "만료된 분석 요청"
			)
	})
	ApiResponse<FaceAnalysisResultResponse> submitResult(
			@Parameter(hidden = true) AuthUser authUser,
			@Positive Long analysisRequestId,
			@Valid
			@io.swagger.v3.oas.annotations.parameters.RequestBody(
					required = true,
					content = @Content(
							schema = @Schema(
									implementation = FaceAnalysisResultSubmitRequest.class
							),
							examples = @ExampleObject(value = """
									{
									  "modelVersion": "face-type-facenet-geometry-v3-experimental",
									  "tags": [
									    {
									      "code": "DOG",
									      "rank": 1,
									      "relativeScore": 0.342118
									    }
									  ]
									}
									""")
					)
			)
			FaceAnalysisResultSubmitRequest request
	);
}
