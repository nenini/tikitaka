package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.VoiceSessionAnalysis;
import com.date.backend.domain.report.domain.VoiceSessionReport;
import com.date.backend.domain.report.dto.request.VoiceSessionAnalysisRequest;
import com.date.backend.domain.report.dto.request.VoiceSessionReportRequest;
import com.date.backend.domain.report.dto.response.VoiceSessionResultAcceptedResponse;
import com.date.backend.domain.report.repository.VoiceSessionAnalysisRepository;
import com.date.backend.domain.report.repository.VoiceSessionReportRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Set;

@Service
public class VoiceSessionResultService {
	private static final Set<String> REPORT_STATUSES = Set.of("COMPLETED", "FALLBACK", "FAILED");
	private static final Set<String> GENERATION_MODES = Set.of("RULE_BASED", "LLM");

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final VoiceSessionAnalysisRepository analysisRepository;
	private final VoiceSessionReportRepository reportRepository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	public VoiceSessionResultService(WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			VoiceSessionAnalysisRepository analysisRepository,
			VoiceSessionReportRepository reportRepository,
			ObjectMapper objectMapper, Clock clock) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.analysisRepository = analysisRepository;
		this.reportRepository = reportRepository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Transactional
	public VoiceSessionResultAcceptedResponse receiveAnalysis(VoiceSessionAnalysisRequest request) {
		validateSessionAndParticipant(request.sessionId(), request.userId());
		validateMetrics(request.metrics());
		String payloadHash = hash(request);
		VoiceSessionAnalysis existing = analysisRepository
				.findBySessionIdAndUserIdAndAnalysisVersion(
						request.sessionId(), request.userId(), request.analysisVersion())
				.orElse(null);
		if (existing != null) {
			assertSamePayload(existing.getPayloadHash(), payloadHash);
			return accepted(existing.getId(), request.sessionId(), request.userId(),
					request.analysisVersion(), true);
		}
		LocalDateTime now = LocalDateTime.now(clock);
		VoiceSessionAnalysis saved = analysisRepository.save(new VoiceSessionAnalysis(
				request.sessionId(), request.userId(), request.schemaVersion(),
				request.analysisVersion(), request.sessionDurationMs(),
				request.analyzedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime(),
				serialize(request.metrics()), payloadHash, now));
		return accepted(saved.getId(), request.sessionId(), request.userId(),
				request.analysisVersion(), false);
	}

	@Transactional
	public VoiceSessionResultAcceptedResponse receiveReport(VoiceSessionReportRequest request) {
		validateSessionAndParticipant(request.sessionId(), request.userId());
		validateReport(request);
		if (!analysisRepository.existsBySessionIdAndUserIdAndAnalysisVersion(
				request.sessionId(), request.userId(), request.analysisVersion())) {
			throw new BusinessException(ReportErrorCode.REPORT_NOT_PREPARED);
		}
		String payloadHash = hash(request);
		VoiceSessionReport existing = reportRepository
				.findBySessionIdAndUserIdAndReportVersion(
						request.sessionId(), request.userId(), request.reportVersion())
				.orElse(null);
		if (existing != null) {
			assertSamePayload(existing.getPayloadHash(), payloadHash);
			return accepted(existing.getId(), request.sessionId(), request.userId(),
					request.reportVersion(), true);
		}
		LocalDateTime now = LocalDateTime.now(clock);
		VoiceSessionReport saved = reportRepository.save(new VoiceSessionReport(
				request.sessionId(), request.userId(), request.schemaVersion(),
				request.analysisVersion(), request.reportVersion(), request.reportStatus(),
				request.generationMode(), request.headline(), serialize(request.notes()),
				request.nextMission(), payloadHash,
				request.generatedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime(), now));
		return accepted(saved.getId(), request.sessionId(), request.userId(),
				request.reportVersion(), false);
	}

	private void validateSessionAndParticipant(Long sessionId, Long userId) {
		var session = sessionRepository.findByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND));
		if (!session.isAiVideo()) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_CONTRACT_INVALID);
		}
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_PARTICIPANT_NOT_FOUND);
		}
	}

	private void validateMetrics(VoiceSessionAnalysisRequest.Metrics metrics) {
		int fillerTotal = metrics.fillerBreakdown().values().stream().mapToInt(Integer::intValue).sum();
		if (fillerTotal != metrics.fillerCount()
				|| (metrics.utteranceCount() == 0) != (metrics.meanUtteranceMs() == null)
				|| (metrics.responseSampleCount() == 0) != (metrics.meanResponseMs() == null)) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_CONTRACT_INVALID);
		}
	}

	private void validateReport(VoiceSessionReportRequest request) {
		if (!REPORT_STATUSES.contains(request.reportStatus())
				|| !GENERATION_MODES.contains(request.generationMode())) {
			throw new BusinessException(ReportErrorCode.REPORT_RESULT_CONTRACT_INVALID);
		}
		boolean failed = "FAILED".equals(request.reportStatus());
		if (failed != (request.headline() == null && request.notes().isEmpty()
				&& request.nextMission() == null)) {
			throw new BusinessException(ReportErrorCode.REPORT_RESULT_CONTRACT_INVALID);
		}
	}

	private void assertSamePayload(String existingHash, String incomingHash) {
		if (!existingHash.equals(incomingHash)) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_IDEMPOTENCY_CONFLICT);
		}
	}

	private VoiceSessionResultAcceptedResponse accepted(Long id, Long sessionId,
			Long userId, String version, boolean duplicate) {
		return new VoiceSessionResultAcceptedResponse(id, sessionId, userId, version, duplicate);
	}

	private String serialize(Object value) {
		try { return objectMapper.writeValueAsString(value); }
		catch (JsonProcessingException exception) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SERIALIZATION_FAILED);
		}
	}

	private String hash(Object value) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
					.digest(serialize(value).getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SERIALIZATION_FAILED);
		}
	}
}
