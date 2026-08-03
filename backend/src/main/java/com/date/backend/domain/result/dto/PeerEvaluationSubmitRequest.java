package com.date.backend.domain.result.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record PeerEvaluationSubmitRequest(
		@Schema(description = "대화의 편안함 별점", example = "5", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int comfortScore,
		@Schema(description = "질문 연결성 별점", example = "4", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int questionConnectionScore,
		@Schema(description = "경청 태도 별점", example = "5", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int listeningScore,
		@Schema(description = "리액션 별점", example = "4", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int reactionScore,
		@Schema(description = "대화 균형 별점", example = "4", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int balanceScore,
		@Schema(description = "매너 별점", example = "5", minimum = "1", maximum = "5")
		@Min(1) @Max(5) int mannerScore,
		@Schema(description = "잘했던 행동(선택)", example = "상대방의 이야기를 잘 들어줬어요.",
				maxLength = 1000, nullable = true)
		@Size(max = 1000) String goodBehaviorText,
		@Schema(description = "개선하면 좋을 행동(선택)", example = "질문을 조금 더 자연스럽게 이어가면 좋겠어요.",
				maxLength = 1000, nullable = true)
		@Size(max = 1000) String improvementText
) {
}
