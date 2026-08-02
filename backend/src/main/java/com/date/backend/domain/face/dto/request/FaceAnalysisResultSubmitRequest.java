package com.date.backend.domain.face.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record FaceAnalysisResultSubmitRequest(
		@NotBlank
		@Size(max = 100)
		String modelVersion,

		@NotEmpty
		@Size(max = 10)
		List<@Valid FaceAnalysisResultTagRequest> tags
) {
	public FaceAnalysisResultSubmitRequest {
		tags = tags == null ? null : List.copyOf(tags);
	}
}
