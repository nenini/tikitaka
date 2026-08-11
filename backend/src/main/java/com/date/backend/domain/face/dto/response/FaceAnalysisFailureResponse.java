package com.date.backend.domain.face.dto.response;

import com.date.backend.domain.face.domain.FaceAnalysisFailureCode;
import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;

import java.time.LocalDateTime;

public record FaceAnalysisFailureResponse(
		Long analysisRequestId,
		FaceAnalysisStatus status,
		FaceAnalysisFailureCode failureCode,
		LocalDateTime failedAt
) {
	public static FaceAnalysisFailureResponse from(FaceAnalysisRequest request) {
		return new FaceAnalysisFailureResponse(
				request.getId(),
				request.getStatus(),
				request.getFailureCode(),
				request.getFailedAt()
		);
	}
}
