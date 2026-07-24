package com.date.backend.domain.face.dto.response;

import com.date.backend.domain.face.domain.FaceAnalysisResultTag;
import com.date.backend.domain.face.domain.FaceType;

import java.math.BigDecimal;

public record FaceAnalysisResultTagResponse(
		FaceType code,
		short rank,
		BigDecimal relativeScore
) {
	public static FaceAnalysisResultTagResponse from(FaceAnalysisResultTag resultTag) {
		return new FaceAnalysisResultTagResponse(
				FaceType.valueOf(resultTag.getFaceTag().getCode()),
				resultTag.getRankOrder(),
				resultTag.getRelativeScore()
		);
	}
}
