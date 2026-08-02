package com.date.backend.domain.face.dto.request;

import com.date.backend.domain.face.domain.FaceType;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record FaceAnalysisResultTagRequest(
		@NotNull
		FaceType code,

		@NotNull
		@DecimalMin("0.0")
		@DecimalMax("1.0")
		@Digits(integer = 1, fraction = 6)
		BigDecimal relativeScore,

		@NotNull
		@Min(1)
		@Max(10)
		Short rank
) {
}
