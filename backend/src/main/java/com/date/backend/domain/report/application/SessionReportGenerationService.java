package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.SessionReport;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import com.date.backend.domain.report.domain.SessionReportStatus;

@Service
public class SessionReportGenerationService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final SessionReportRepository reportRepository;

	public SessionReportGenerationService(WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository, SessionReportRepository reportRepository) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.reportRepository = reportRepository;
	}

	@Transactional
	public boolean prepare(Long sessionId, LocalDateTime requestedAt) {
		var session = sessionRepository.findWithMatchPairByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND));
		if (!session.isEnded()) {
			throw new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED,
					"종료된 세션만 AI 리포트를 생성할 수 있습니다.");
		}
		boolean created = false;
		var participants = participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId);
		for (var participant : participants) {
			if (!reportRepository.existsBySessionIdAndUserId(sessionId, participant.getUserId())) {
				reportRepository.save(new SessionReport(sessionId, participant.getUserId(), requestedAt));
				created = true;
			}
		}
		if (participants.isEmpty()) {
			throw new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED,
					"리포트를 생성할 세션 참여자가 없습니다.");
		}
		return created;
	}

	@Transactional
	public int expireTimedOut(LocalDateTime cutoff, LocalDateTime failedAt, int batchSize) {
		List<SessionReport> reports = reportRepository.findTimedOutForUpdate(
				SessionReportStatus.GENERATING, cutoff, PageRequest.of(0, batchSize));
		for (SessionReport report : reports) {
			report.markRequestFailed("AI_REPORT_GENERATION_TIMEOUT",
					"제한 시간 안에 AI 리포트 결과를 받지 못했습니다.", failedAt);
		}
		return reports.size();
	}

	@Transactional
	public void recordAttempt(Long sessionId, LocalDateTime attemptedAt) {
		for (SessionReport report : requiredReports(sessionId)) report.recordAttempt(attemptedAt);
	}

	@Transactional
	public void markGenerating(Long sessionId, LocalDateTime startedAt) {
		for (SessionReport report : requiredReports(sessionId)) report.markGenerating(startedAt);
	}

	@Transactional
	public void markFailed(Long sessionId, String code, String reason, LocalDateTime failedAt) {
		for (SessionReport report : requiredReports(sessionId)) {
			report.markRequestFailed(code, reason, failedAt);
		}
	}

	private List<SessionReport> requiredReports(Long sessionId) {
		List<SessionReport> reports = reportRepository.findAllBySessionIdForUpdate(sessionId);
		if (reports.isEmpty()) throw new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED);
		return reports;
	}
}
