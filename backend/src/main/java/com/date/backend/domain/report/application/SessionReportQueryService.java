package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.response.*;
import com.date.backend.domain.report.repository.*;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@Transactional(readOnly = true)
public class SessionReportQueryService {
	private static final TypeReference<Map<String, ReportAxisResponse>> AXES_TYPE = new TypeReference<>() {};
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final SessionReportRepository reportRepository;
	private final SessionParticipantAnalysisRepository analysisRepository;
	private final SessionAnalysisEvidenceSegmentRepository evidenceRepository;
	private final ObjectMapper objectMapper;

	public SessionReportQueryService(WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			SessionReportRepository reportRepository,
			SessionParticipantAnalysisRepository analysisRepository,
			SessionAnalysisEvidenceSegmentRepository evidenceRepository,
			ObjectMapper objectMapper) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.reportRepository = reportRepository;
		this.analysisRepository = analysisRepository;
		this.evidenceRepository = evidenceRepository;
		this.objectMapper = objectMapper;
	}

	public SessionReportSummaryResponse getBySession(Long userId, Long sessionId) {
		assertSessionParticipant(userId, sessionId);
		SessionReport report = reportRepository.findBySessionIdAndUserId(sessionId, userId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.REPORT_NOT_FOUND));
		AnalysisBundle analysis = analysisOf(report);
		return new SessionReportSummaryResponse(
				report.getId(), report.getSessionId(), report.getUserId(), report.getStatus(),
				report.getGenerationMode(), analysis.axes(), report.getSummaryText(),
				list(report.getStrengths()), list(report.getImprovements()),
				report.getFailureCode(), report.getFailureReason(), report.getRequestedAt(),
				report.getGeneratedAt(), report.getUpdatedAt());
	}

	public SessionReportDetailResponse getDetail(Long userId, Long reportId) {
		SessionReport report = reportRepository.findById(reportId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.REPORT_NOT_FOUND));
		if (!report.getUserId().equals(userId)
				|| !participantRepository.existsByRoom_IdAndUserId(report.getSessionId(), userId)) {
			throw new BusinessException(ReportErrorCode.REPORT_ACCESS_DENIED);
		}
		AnalysisBundle analysis = analysisOf(report);
		return new SessionReportDetailResponse(
				report.getId(), report.getSessionId(), report.getUserId(), report.getStatus(),
				report.getGenerationMode(), report.getAnalysisVersion(), report.getReportVersion(),
				analysis.axes(), analysis.metrics(), report.getSummaryText(), list(report.getStrengths()),
				list(report.getImprovements()), list(report.getNextMissions()), analysis.evidence(),
				report.getFailureCode(), report.getFailureReason(), report.getAttemptCount(),
				report.getRequestedAt(), report.getGenerationStartedAt(), report.getGeneratedAt(),
				report.getUpdatedAt());
	}

	private void assertSessionParticipant(Long userId, Long sessionId) {
		if (!sessionRepository.existsById(sessionId)) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND);
		}
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(ReportErrorCode.REPORT_ACCESS_DENIED);
		}
	}

	private AnalysisBundle analysisOf(SessionReport report) {
		if (report.getStatus() != SessionReportStatus.COMPLETED
				|| report.getAnalysisVersion() == null) return AnalysisBundle.empty();
		return analysisRepository.findBySessionUserAndVersion(
						report.getSessionId(), report.getUserId(), report.getAnalysisVersion())
				.map(this::mapAnalysis)
				.orElseGet(AnalysisBundle::empty);
	}

	private AnalysisBundle mapAnalysis(SessionParticipantAnalysis analysis) {
		if (analysis.getStatus() != AnalysisStatus.COMPLETED) return AnalysisBundle.empty();
		try {
			Map<String, ReportAxisResponse> axes = objectMapper.readValue(analysis.getAxesJson(), AXES_TYPE);
			ReportMetricsResponse metrics = objectMapper.readValue(
					analysis.getMetricsJson(), ReportMetricsResponse.class);
			List<ReportEvidenceResponse> evidence = evidenceRepository
					.findAllByAnalysis_IdOrderByStartMsAsc(analysis.getId()).stream()
					.map(item -> new ReportEvidenceResponse(item.getEvidenceKey(), item.getEventType(),
							item.getStartMs(), item.getEndMs(), item.getDescription()))
					.toList();
			return new AnalysisBundle(Collections.unmodifiableMap(axes), metrics, evidence);
		} catch (JsonProcessingException exception) {
			throw new BusinessException(ReportErrorCode.REPORT_RESPONSE_SERIALIZATION_FAILED);
		}
	}

	private List<String> list(List<String> value) {
		return value == null ? List.of() : List.copyOf(value);
	}

	private record AnalysisBundle(
			Map<String, ReportAxisResponse> axes,
			ReportMetricsResponse metrics,
			List<ReportEvidenceResponse> evidence
	) {
		private static AnalysisBundle empty() { return new AnalysisBundle(Map.of(), null, List.of()); }
	}
}
