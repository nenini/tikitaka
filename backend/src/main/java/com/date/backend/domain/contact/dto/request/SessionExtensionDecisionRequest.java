package com.date.backend.domain.contact.dto.request;

import com.date.backend.domain.contact.domain.ContactDecision;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record SessionExtensionDecisionRequest(
		@NotNull
		@Schema(
				description = "마지막 5분 유지 의사. AGREE면 유지, DECLINE이면 즉시 종료",
				example = "AGREE"
		)
		ContactDecision decision
) {
}
