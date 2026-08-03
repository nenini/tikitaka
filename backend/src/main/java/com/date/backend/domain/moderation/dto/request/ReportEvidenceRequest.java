package com.date.backend.domain.moderation.dto.request;

import com.date.backend.domain.moderation.domain.ReportEvidenceType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public record ReportEvidenceRequest(
		@NotNull
		@Schema(example = "SCREENSHOT")
		ReportEvidenceType evidenceType,

		@NotBlank
		@Size(max = 1000)
		@Schema(
				description = "이미 업로드된 증거 파일의 비공개 저장소 키",
				example = "moderation/session-15/evidence-uuid.png"
		)
		String objectKey,

		@Size(max = 255)
		@Schema(example = "screenshot.png")
		String originalFileName,

		@Size(max = 100)
		@Schema(example = "image/png")
		String contentType,

		@PositiveOrZero
		@Schema(example = "245760")
		long sizeBytes,

		@Schema(description = "증거가 생성된 시각")
		LocalDateTime capturedAt
) {
}
