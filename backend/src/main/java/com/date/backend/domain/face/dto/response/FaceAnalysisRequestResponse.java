package com.date.backend.domain.face.dto.response;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;

public record FaceAnalysisRequestResponse(
		Long analysisRequestId,
		FaceAnalysisStatus status
) {
	public static FaceAnalysisRequestResponse from(FaceAnalysisRequest request) {
		return new FaceAnalysisRequestResponse(request.getId(), request.getStatus());
	}
}
