package com.date.backend.domain.contact.dto.request;

import com.date.backend.domain.contact.domain.ContactDecision;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record SessionExtensionDecisionRequest(
		@NotNull
		@Schema(
				description = "마지막 5분 진행 의사. 양측 모두 AGREE이면 35분까지 유지하며, DECLINE 또는 미응답이면 30분에 종료",
				example = "AGREE"
		)
		ContactDecision decision
) {
}
