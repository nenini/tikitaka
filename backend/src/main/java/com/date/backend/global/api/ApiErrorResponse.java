package com.date.backend.global.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

@Schema(description = "공통 오류 응답")
public record ApiErrorResponse(
		@Schema(description = "요청 성공 여부", example = "false")
		boolean success,

		@Schema(description = "서비스 오류 코드", example = "INVALID_INPUT")
		String code,

		@Schema(description = "오류 메시지", example = "요청 값이 올바르지 않습니다.")
		String message,

		@Schema(description = "필드별 오류 목록")
		List<FieldError> errors,

		@Schema(description = "오류 발생 시각")
		Instant timestamp,

		@Schema(description = "요청 경로", example = "/api/example")
		String path
) {
	public ApiErrorResponse {
		errors = errors == null ? List.of() : List.copyOf(errors);
	}

	public static ApiErrorResponse of(String code, String message, String path) {
		return of(code, message, List.of(), path);
	}

	public static ApiErrorResponse of(
			String code,
			String message,
			List<FieldError> errors,
			String path
	) {
		return new ApiErrorResponse(false, code, message, errors, Instant.now(), path);
	}

	@Schema(description = "필드 오류")
	public record FieldError(
			@Schema(description = "오류가 발생한 필드", example = "email")
			String field,

			@Schema(description = "거부된 값", nullable = true)
			Object rejectedValue,

			@Schema(description = "오류 사유", example = "올바른 이메일 형식이어야 합니다.")
			String reason
	) {
	}
}
