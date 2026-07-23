package com.date.backend.domain.survey.api;

import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.domain.survey.dto.response.SurveyOptionsResponse;
import com.date.backend.domain.survey.dto.response.SurveyResponse;
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

@Tag(name = "Survey", description = "온보딩 설문 선택지 및 사용자 설문 응답 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface SurveySwaggerDocs {

	@Operation(
			summary = "설문 선택지 조회",
			description = "사용자의 선호 상대 성별에 맞는 얼굴상과 성격, 고민 선택지를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = SurveyOptionsResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음")
	})
	ApiResponse<SurveyOptionsResponse> getOptions(
			@Parameter(hidden = true) AuthUser authUser
	);

	@Operation(
			summary = "설문 응답 등록",
			description = "원하는 얼굴상과 성격, 본인 성격, 선호 나이대, 고민을 한 번에 등록합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "등록 성공",
					content = @Content(schema = @Schema(implementation = SurveyResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "입력값 또는 설문 선택지 검증 실패",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "INVALID_SURVEY_OPTION",
							  "message": "유효하지 않은 설문 선택지가 포함되어 있습니다."
							}
							"""))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "프로필 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "이미 등록된 설문",
					content = @Content(examples = @ExampleObject(value = """
							{
							  "success": false,
							  "code": "SURVEY_ALREADY_EXISTS",
							  "message": "이미 설문이 등록되어 있습니다."
							}
							"""))
			)
	})
	ApiResponse<SurveyResponse> create(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid SurveySaveRequest request
	);

	@Operation(
			summary = "내 설문 응답 조회",
			description = "인증 사용자의 현재 설문 응답을 한 번에 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = SurveyResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "설문 응답 없음")
	})
	ApiResponse<SurveyResponse> getMine(
			@Parameter(hidden = true) AuthUser authUser
	);

	@Operation(
			summary = "설문 응답 전체 수정",
			description = "온보딩 다시 하기를 위해 기존 설문 응답 전체를 새로운 응답으로 교체합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "수정 성공",
					content = @Content(schema = @Schema(implementation = SurveyResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "입력값 또는 설문 선택지 검증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "설문 응답 없음")
	})
	ApiResponse<SurveyResponse> update(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid SurveySaveRequest request
	);
}
