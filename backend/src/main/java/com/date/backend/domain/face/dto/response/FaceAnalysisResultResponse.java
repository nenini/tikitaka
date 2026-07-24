package com.date.backend.domain.face.dto.response;

import com.date.backend.domain.face.domain.FaceAnalysisResult;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.domain.FaceType;

import java.time.LocalDateTime;
import java.util.List;

public record FaceAnalysisResultResponse(
		Long analysisRequestId,
		FaceAnalysisStatus status,
		FaceType primaryType,
		String modelVersion,
		List<FaceAnalysisResultTagResponse> tags,
		LocalDateTime analyzedAt
) {
	public static FaceAnalysisResultResponse from(FaceAnalysisResult result) {
		return new FaceAnalysisResultResponse(
				result.getAnalysisRequest().getId(),
				result.getAnalysisRequest().getStatus(),
				FaceType.valueOf(result.getPrimaryFaceTag().getCode()),
				result.getModelVersion(),
				result.getTags().stream()
						.map(FaceAnalysisResultTagResponse::from)
						.toList(),
				result.getAnalyzedAt()
		);
	}
}
