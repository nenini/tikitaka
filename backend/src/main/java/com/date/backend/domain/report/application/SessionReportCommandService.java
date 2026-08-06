package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.response.*;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;

@Service
public class SessionReportCommandService {
	private final WaitingRoomRepository sessions;
	private final RoomParticipantRepository participants;
	private final SessionReportRepository reports;
	private final SessionReportGenerationService generationService;
	private final Clock clock;

	public SessionReportCommandService(WaitingRoomRepository sessions,
			RoomParticipantRepository participants, SessionReportRepository reports,
			SessionReportGenerationService generationService, Clock clock) {
		this.sessions = sessions; this.participants = participants; this.reports = reports;
		this.generationService = generationService; this.clock = clock;
	}

	@Transactional
	public SessionReportStatusResponse request(Long userId, Long sessionId) {
		assertParticipant(userId, sessionId);
		if (!reports.findAllBySessionIdOrderByUserIdAsc(sessionId).isEmpty()
				&& !reports.existsBySessionIdAndUserId(sessionId, userId)) {
			throw new BusinessException(ReportErrorCode.REPORT_DELETED);
		}
		LocalDateTime requestedAt = LocalDateTime.now(clock);
		generationService.prepare(sessionId, requestedAt);
		SessionReport report = reports.findBySessionIdAndUserId(sessionId, userId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED));
		return status(report);
	}

	@Transactional
	public SessionReportDeleteResponse delete(Long userId, Long reportId) {
		SessionReport report = reports.findById(reportId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.REPORT_NOT_FOUND));
		if (!report.getUserId().equals(userId)
				|| !participants.existsByRoom_IdAndUserId(report.getSessionId(), userId)) {
			throw new BusinessException(ReportErrorCode.REPORT_ACCESS_DENIED);
		}
		if (report.getStatus() == SessionReportStatus.PENDING
				|| report.getStatus() == SessionReportStatus.GENERATING) {
			throw new BusinessException(ReportErrorCode.REPORT_DELETE_IN_PROGRESS);
		}
		reports.delete(report);
		return new SessionReportDeleteResponse(reportId, true);
	}

	private void assertParticipant(Long userId, Long sessionId) {
		if (!sessions.existsById(sessionId)) throw new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND);
		if (!participants.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(ReportErrorCode.REPORT_ACCESS_DENIED);
		}
	}

	private SessionReportStatusResponse status(SessionReport report) {
		return new SessionReportStatusResponse(report.getId(), report.getSessionId(), report.getStatus(),
				report.getFailureCode(), report.getFailureReason(), report.getRequestedAt(),
				report.getGeneratedAt(), report.getUpdatedAt());
	}
}
