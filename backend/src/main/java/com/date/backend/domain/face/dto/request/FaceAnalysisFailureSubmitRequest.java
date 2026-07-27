package com.date.backend.domain.face.dto.request;

import com.date.backend.domain.face.domain.FaceAnalysisFailureCode;
import jakarta.validation.constraints.NotNull;

public record FaceAnalysisFailureSubmitRequest(
		@NotNull
		FaceAnalysisFailureCode failureCode
) {
}
