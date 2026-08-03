package com.date.backend.domain.moderation.dto.request;

import com.date.backend.domain.moderation.domain.ModerationReportReason;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ModerationReportCreateRequest(
		@NotNull
		@Positive
		@Schema(description = "신고 대상 세션 ID", example = "15")
		Long sessionId,

		@NotNull
		@Positive
		@Schema(description = "피신고 사용자 ID", example = "2")
		Long reportedUserId,

		@NotNull
		@Schema(example = "HARASSMENT")
		ModerationReportReason reasonCode,

		@Size(max = 2000)
		@Schema(description = "신고 상세 내용", maxLength = 2000)
		String details,

		@Size(max = 10)
		List<@Valid ReportEvidenceRequest> evidences
) {
	public ModerationReportCreateRequest {
		evidences = evidences == null ? List.of() : List.copyOf(evidences);
	}
}
