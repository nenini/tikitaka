package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.ModerationReport;
import com.date.backend.domain.moderation.domain.ReportEvidence;
import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.response.ModerationReportResponse;
import com.date.backend.domain.moderation.dto.response.ReportEvidenceResponse;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
public class ModerationReportService {
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final ModerationReportRepository reportRepository;
	private final Clock clock;
	private final ApplicationEventPublisher eventPublisher;

	public ModerationReportService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			ModerationReportRepository reportRepository,
			Clock clock,
			ApplicationEventPublisher eventPublisher
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.reportRepository = reportRepository;
		this.clock = clock;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public ModerationReportResponse create(
			Long reporterUserId,
			ModerationReportCreateRequest request
	) {
		WaitingRoom session = sessionRepository
				.findWithMatchPairByIdForUpdate(request.sessionId())
				.orElseThrow(() -> new BusinessException(
						ModerationErrorCode.REPORT_SESSION_NOT_FOUND
				));

		if (reporterUserId.equals(request.reportedUserId())) {
			throw new BusinessException(
					ModerationErrorCode.SELF_REPORT_NOT_ALLOWED
			);
		}
		if (!participantRepository.existsByRoom_IdAndUserId(
				request.sessionId(),
				reporterUserId
		)) {
			throw new BusinessException(
					ModerationErrorCode.REPORTER_NOT_SESSION_PARTICIPANT
			);
		}
		if (!participantRepository.existsByRoom_IdAndUserId(
				request.sessionId(),
				request.reportedUserId()
		)) {
			throw new BusinessException(
					ModerationErrorCode.REPORTED_USER_NOT_SESSION_PARTICIPANT
			);
		}
		if (reportRepository
				.existsBySessionIdAndReporterUserIdAndReportedUserId(
						request.sessionId(),
						reporterUserId,
						request.reportedUserId()
				)) {
			throw new BusinessException(
					ModerationErrorCode.DUPLICATE_SESSION_REPORT
			);
		}

		LocalDateTime reportedAt = LocalDateTime.now(clock).withNano(0);
		ModerationReport report = new ModerationReport(
				request.sessionId(),
				reporterUserId,
				request.reportedUserId(),
				request.reasonCode(),
				request.details(),
				session.getStatus(),
				reportedAt
		);
		ModerationReport saved = reportRepository.saveAndFlush(report);
		if (session.isEnded()) {
			eventPublisher.publishEvent(
					new ModerationTranscriptRequestedEvent(request.sessionId())
			);
		}
		return toResponse(saved);
	}

	private ModerationReportResponse toResponse(ModerationReport report) {
		return new ModerationReportResponse(
				report.getId(),
				report.getSessionId(),
				report.getReporterUserId(),
				report.getReportedUserId(),
				report.getReason(),
				report.getDetails(),
				report.getStatus(),
				report.getSessionStatusSnapshot(),
				report.getReportedAt(),
				report.getEvidences().stream()
						.map(this::toEvidenceResponse)
						.toList()
		);
	}

	private ReportEvidenceResponse toEvidenceResponse(ReportEvidence evidence) {
		return new ReportEvidenceResponse(
				evidence.getId(),
				evidence.getEvidenceType(),
				evidence.getObjectKey(),
				evidence.getOriginalFileName(),
				evidence.getContentType(),
				evidence.getSizeBytes(),
				evidence.getCapturedAt()
		);
	}
}
