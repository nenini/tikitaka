package com.date.backend.domain.survey.dto.response;

import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;

public record SurveyFaceTagResponse(
		Long id,
		String code,
		String name,
		ApplicableGender applicableGender
) {
	public static SurveyFaceTagResponse from(FaceTagCatalog faceTag) {
		return new SurveyFaceTagResponse(
				faceTag.getId(),
				faceTag.getCode(),
				faceTag.getName(),
				faceTag.getApplicableGender()
		);
	}
}
