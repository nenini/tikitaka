package com.date.backend.domain.face.dto.response;

import com.date.backend.domain.face.domain.FaceAnalysisResultTag;
import com.date.backend.domain.face.domain.FaceType;

import java.math.BigDecimal;

public record FaceAnalysisResultTagResponse(
		FaceType code,
		String displayName,
		short rank,
		BigDecimal relativeScore
) {
	public static FaceAnalysisResultTagResponse from(FaceAnalysisResultTag resultTag) {
		return new FaceAnalysisResultTagResponse(
				FaceType.valueOf(resultTag.getFaceTag().getCode()),
				resultTag.getFaceTag().getName(),
				resultTag.getRankOrder(),
				resultTag.getRelativeScore()
		);
	}
}
