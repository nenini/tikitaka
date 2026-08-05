package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.request.AiReportResultRequest;
import com.date.backend.domain.report.dto.response.AiReportResultAcceptedResponse;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.ZoneId;
import java.util.*;

@Service
public class AiReportResultService {
	private static final Logger log = LoggerFactory.getLogger(AiReportResultService.class);
	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final SessionReportRepository reportRepository;
	private final ObjectMapper objectMapper;

	public AiReportResultService(WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			SessionReportRepository reportRepository, ObjectMapper objectMapper) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.reportRepository = reportRepository;
		this.objectMapper = objectMapper;
	}

	@Transactional
	public AiReportResultAcceptedResponse receive(AiReportResultRequest request) {
		if (request.schemaVersion() != 1) invalid();
		sessionRepository.findWithMatchPairByIdForUpdate(request.sessionId())
				.orElseThrow(() -> new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND));
		Set<Long> userIds = new HashSet<>();
		int accepted = 0;
		int duplicates = 0;
		for (AiReportResultRequest.ParticipantReportResult result : request.reports()) {
			if (!userIds.add(result.userId())) invalid();
			if (!participantRepository.existsByRoom_IdAndUserId(request.sessionId(), result.userId())) {
				throw new BusinessException(ReportErrorCode.ANALYSIS_PARTICIPANT_NOT_FOUND);
			}
			validateResult(result);
			SessionReport report = reportRepository
					.findBySessionIdAndUserIdForUpdate(request.sessionId(), result.userId())
					.orElseThrow(() -> new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED));
			boolean changed;
			try {
				String payloadHash = hash(result);
				if (result.reportStatus() == AiReportResultStatus.FAILED) {
					changed = report.fail(request.analysisVersion(), request.reportVersion(), payloadHash,
							result.failureCode().name(), result.failureReason(),
							request.generatedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime());
				} else {
					changed = report.complete(request.analysisVersion(), request.reportVersion(), payloadHash,
							result.generationMode(), result.summaryText(), result.strengths(),
							result.improvements(), result.nextMissions(),
							result.failureCode() == null ? null : result.failureCode().name(),
							result.failureReason(),
							request.generatedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime());
				}
			} catch (IllegalStateException exception) {
				throw new BusinessException(ReportErrorCode.REPORT_RESULT_CONFLICT);
			}
			if (changed) accepted++; else duplicates++;
		}
		log.info("AI report result received. sessionId={}, reportVersion={}, accepted={}, duplicates={}",
				request.sessionId(), request.reportVersion(), accepted, duplicates);
		return new AiReportResultAcceptedResponse(request.sessionId(), request.reportVersion(), accepted, duplicates);
	}

	private void validateResult(AiReportResultRequest.ParticipantReportResult result) {
		switch (result.reportStatus()) {
			case COMPLETED -> {
				if (result.generationMode() != ReportGenerationMode.LLM
						|| blank(result.summaryText()) || result.failureCode() != null
						|| !blank(result.failureReason())) invalid();
			}
			case FALLBACK -> {
				if (result.generationMode() != ReportGenerationMode.RULE_BASED
						|| blank(result.summaryText())) invalid();
			}
			case FAILED -> {
				if (result.generationMode() != ReportGenerationMode.NONE
						|| !blank(result.summaryText()) || !result.strengths().isEmpty()
						|| !result.improvements().isEmpty() || !result.nextMissions().isEmpty()
						|| result.failureCode() == null || blank(result.failureReason())) invalid();
			}
		}
	}

	private String hash(Object value) {
		try {
			byte[] bytes = MessageDigest.getInstance("SHA-256")
					.digest(objectMapper.writeValueAsString(value).getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(bytes);
		} catch (NoSuchAlgorithmException | JsonProcessingException exception) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SERIALIZATION_FAILED);
		}
	}

	private boolean blank(String value) { return value == null || value.isBlank(); }
	private void invalid() { throw new BusinessException(ReportErrorCode.REPORT_RESULT_CONTRACT_INVALID); }
}
