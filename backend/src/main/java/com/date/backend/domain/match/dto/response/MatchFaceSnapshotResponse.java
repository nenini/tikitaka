package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.survey.domain.FaceTagCatalog;

public record MatchFaceSnapshotResponse(
		Long id,
		String code,
		String name
) {
	public static MatchFaceSnapshotResponse from(FaceTagCatalog faceTag) {
		return new MatchFaceSnapshotResponse(
				faceTag.getId(),
				faceTag.getCode(),
				faceTag.getName()
		);
	}
}
