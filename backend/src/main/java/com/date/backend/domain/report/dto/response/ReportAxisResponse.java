package com.date.backend.domain.report.dto.response;

import com.date.backend.domain.report.domain.AnalysisRawUnit;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

public record ReportAxisResponse(
		@Schema(example = "4.25", nullable = true) BigDecimal score,
		@Schema(example = "true") boolean measured,
		@Schema(example = "2.5", nullable = true) BigDecimal raw,
		@Schema(example = "COUNT_PER_30_MINUTES", nullable = true) AnalysisRawUnit rawUnit,
		@Schema(example = "맞장구를 제외한 말 끊기 2회") String note
) {}
