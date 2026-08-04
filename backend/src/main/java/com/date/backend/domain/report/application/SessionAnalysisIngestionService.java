package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.request.SessionAnalysisRequest;
import com.date.backend.domain.report.dto.response.SessionAnalysisAcceptedResponse;
import com.date.backend.domain.report.repository.*;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Service
public class SessionAnalysisIngestionService {
	private static final Logger log = LoggerFactory.getLogger(SessionAnalysisIngestionService.class);
	private static final Set<String> REQUIRED_AXES = Set.of(
			"flow", "question", "listening", "reaction", "balance", "nonverbal"
	);

	private final WaitingRoomRepository sessionRepository;
	private final RoomParticipantRepository participantRepository;
	private final SessionAnalysisReceiptRepository receiptRepository;
	private final SessionParticipantAnalysisRepository analysisRepository;
	private final SessionAnalysisEvidenceSegmentRepository evidenceRepository;
	private final ObjectMapper objectMapper;
	private final Clock clock;

	public SessionAnalysisIngestionService(
			WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			SessionAnalysisReceiptRepository receiptRepository,
			SessionParticipantAnalysisRepository analysisRepository,
			SessionAnalysisEvidenceSegmentRepository evidenceRepository,
			ObjectMapper objectMapper,
			Clock clock
	) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.receiptRepository = receiptRepository;
		this.analysisRepository = analysisRepository;
		this.evidenceRepository = evidenceRepository;
		this.objectMapper = objectMapper;
		this.clock = clock;
	}

	@Transactional
	public SessionAnalysisAcceptedResponse receive(SessionAnalysisRequest request) {
		String payloadHash = hash(request);

		// Locking the session serializes concurrent first deliveries before checking unique keys.
		var session = sessionRepository.findWithMatchPairByIdForUpdate(request.sessionId())
				.orElseThrow(() -> new BusinessException(ReportErrorCode.ANALYSIS_SESSION_NOT_FOUND));
		long durationMs = sessionDurationMs(session);

		SessionAnalysisReceipt existing = receiptRepository
				.findBySessionIdAndAnalysisVersion(request.sessionId(), request.analysisVersion())
				.orElse(null);
		if (existing != null) {
			if (!existing.getSessionId().equals(request.sessionId())
					|| !existing.getAnalysisVersion().equals(request.analysisVersion())
					|| !existing.getPayloadHash().equals(payloadHash)) {
				log.warn("Session analysis version conflict. sessionId={}, analysisVersion={}",
						request.sessionId(), request.analysisVersion());
				throw new BusinessException(ReportErrorCode.ANALYSIS_IDEMPOTENCY_CONFLICT);
			}
			log.info("Duplicate session analysis accepted. sessionId={}, analysisVersion={}",
					request.sessionId(), request.analysisVersion());
			return SessionAnalysisAcceptedResponse.duplicate(
					request.sessionId(), request.analysisVersion(), request.participants().size());
		}

		validateContract(request, durationMs);
		LocalDateTime receivedAt = LocalDateTime.now(clock);
		SessionAnalysisReceipt receipt = receiptRepository.save(new SessionAnalysisReceipt(
				request.sessionId(), request.schemaVersion(), request.analysisVersion(),
				payloadHash, durationMs,
				request.analyzedAt().atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime(),
				receivedAt
		));

		for (SessionAnalysisRequest.ParticipantAnalysisRequest participant : request.participants()) {
			SessionParticipantAnalysis analysis = analysisRepository.save(new SessionParticipantAnalysis(
					receipt, request.sessionId(), participant.userId(), participant.analysisStatus(),
					serialize(participant.axes()), serialize(participant.metrics()), receivedAt
			));
			for (SessionAnalysisRequest.EvidenceSegmentRequest evidence : participant.evidenceSegments()) {
				evidenceRepository.save(new SessionAnalysisEvidenceSegment(
						analysis, evidence.evidenceId(), evidence.eventType(), evidence.startMs(),
						evidence.endMs(), evidence.description().trim()
				));
			}
		}

		log.info("Session analysis stored. sessionId={}, analysisVersion={}, participants={}",
				request.sessionId(), request.analysisVersion(), request.participants().size());
		return SessionAnalysisAcceptedResponse.accepted(
				request.sessionId(), request.analysisVersion(), request.participants().size());
	}

	private void validateContract(SessionAnalysisRequest request, long durationMs) {
		if (request.schemaVersion() != 1) invalid();
		Set<Long> userIds = new HashSet<>();
		for (SessionAnalysisRequest.ParticipantAnalysisRequest participant : request.participants()) {
			if (!userIds.add(participant.userId())) invalid();
			if (!participantRepository.existsByRoom_IdAndUserId(request.sessionId(), participant.userId())) {
				throw new BusinessException(ReportErrorCode.ANALYSIS_PARTICIPANT_NOT_FOUND);
			}
			if (participant.analysisStatus() == AnalysisStatus.COMPLETED) {
				if (participant.axes() == null || !participant.axes().keySet().equals(REQUIRED_AXES)
						|| participant.metrics() == null) invalid();
				validateAxes(participant.axes());
				validateMetrics(participant.metrics());
			} else if ((participant.axes() != null && !participant.axes().isEmpty())
					|| participant.metrics() != null || !participant.evidenceSegments().isEmpty()) {
				invalid();
			}
			Set<String> evidenceIds = new HashSet<>();
			for (SessionAnalysisRequest.EvidenceSegmentRequest evidence : participant.evidenceSegments()) {
				if (!evidenceIds.add(evidence.evidenceId()) || evidence.endMs() < evidence.startMs()
						|| evidence.endMs() > durationMs) invalid();
			}
		}
	}

	private long sessionDurationMs(com.date.backend.domain.room.domain.WaitingRoom session) {
		if (session.getActualStartAt() == null || session.getActualEndAt() == null
				|| !session.getActualEndAt().isAfter(session.getActualStartAt())) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_CONTRACT_INVALID,
					"종료 시각이 기록된 세션만 분석 결과를 저장할 수 있습니다.");
		}
		return Duration.between(session.getActualStartAt(), session.getActualEndAt()).toMillis();
	}

	private void validateAxes(Map<String, SessionAnalysisRequest.AxisMetricRequest> axes) {
		for (SessionAnalysisRequest.AxisMetricRequest axis : axes.values()) {
			if (axis.measured()) {
				if (axis.score() == null || axis.raw() == null || axis.rawUnit() == null) invalid();
			} else if (axis.score() != null || axis.raw() != null || axis.rawUnit() != null) {
				invalid();
			}
		}
	}

	private void validateMetrics(SessionAnalysisRequest.MetricsRequest metrics) {
		if (!metrics.visionMeasured() && (metrics.smileEpisodeCount() != null
				|| metrics.gazeAwayCount() != null || metrics.faceMissingCount() != null)) invalid();
		if (metrics.visionMeasured() && (metrics.smileEpisodeCount() == null
				|| metrics.gazeAwayCount() == null || metrics.faceMissingCount() == null)) invalid();
		if (metrics.fillerBreakdown() != null) {
			long detailedCount = metrics.fillerBreakdown().values().stream()
					.mapToLong(Integer::longValue).sum();
			if (detailedCount != metrics.fillerCount()) invalid();
		}
	}

	private String serialize(Object value) {
		if (value == null) return null;
		try { return objectMapper.writeValueAsString(value); }
		catch (JsonProcessingException exception) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SERIALIZATION_FAILED);
		}
	}

	private String hash(SessionAnalysisRequest request) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(objectMapper.writeValueAsString(request).getBytes(StandardCharsets.UTF_8));
			return java.util.HexFormat.of().formatHex(digest);
		} catch (NoSuchAlgorithmException | JsonProcessingException exception) {
			throw new BusinessException(ReportErrorCode.ANALYSIS_SERIALIZATION_FAILED);
		}
	}

	private void invalid() {
		throw new BusinessException(ReportErrorCode.ANALYSIS_CONTRACT_INVALID);
	}
}
