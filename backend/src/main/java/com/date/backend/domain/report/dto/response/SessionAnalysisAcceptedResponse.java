package com.date.backend.domain.report.dto.response;

public record SessionAnalysisAcceptedResponse(
		Long sessionId,
		String analysisVersion,
		String status,
		boolean duplicate,
		int receivedParticipantCount
) {
	public static SessionAnalysisAcceptedResponse accepted(Long sessionId, String version, int count) {
		return new SessionAnalysisAcceptedResponse(sessionId, version, "ACCEPTED", false, count);
	}

	public static SessionAnalysisAcceptedResponse duplicate(Long sessionId, String version, int count) {
		return new SessionAnalysisAcceptedResponse(sessionId, version, "ACCEPTED", true, count);
	}
}
