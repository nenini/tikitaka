package com.date.backend.domain.face.exception;

import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.FaceErrorCode;

public class FaceAnalysisRequestExpiredException extends BusinessException {

	public FaceAnalysisRequestExpiredException() {
		super(FaceErrorCode.ANALYSIS_REQUEST_EXPIRED);
	}
}
