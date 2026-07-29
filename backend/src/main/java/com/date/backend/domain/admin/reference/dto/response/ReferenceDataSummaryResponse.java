package com.date.backend.domain.admin.reference.dto.response;

public record ReferenceDataSummaryResponse(
		long faceTypeCount,
		long personalityCount,
		long concernCount
) {
}
