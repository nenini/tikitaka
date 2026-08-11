package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.request.AiReportResultRequest;
import com.date.backend.domain.report.dto.response.AiReportResultAcceptedResponse;
import com.date.backend.domain.report.dto.response.ReportAxisResponse;
import com.date.backend.domain.report.repository.SessionParticipantAnalysisRepository;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
	private final SessionParticipantAnalysisRepository analysisRepository;
	private final ObjectMapper objectMapper;
	private static final TypeReference<Map<String, ReportAxisResponse>> AXES_TYPE =
			new TypeReference<>() {};

	public AiReportResultService(WaitingRoomRepository sessionRepository,
			RoomParticipantRepository participantRepository,
			SessionReportRepository reportRepository,
			SessionParticipantAnalysisRepository analysisRepository,
			ObjectMapper objectMapper) {
		this.sessionRepository = sessionRepository;
		this.participantRepository = participantRepository;
		this.reportRepository = reportRepository;
		this.analysisRepository = analysisRepository;
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
			copyAxisScores(request.sessionId(), result.userId(), request.analysisVersion(), report);
		}
		log.info("AI report result received. sessionId={}, reportVersion={}, accepted={}, duplicates={}",
				request.sessionId(), request.reportVersion(), accepted, duplicates);
		return new AiReportResultAcceptedResponse(request.sessionId(), request.reportVersion(), accepted, duplicates);
	}

	/**
	 * 분석에 저장된 6축 점수를 리포트 행으로 옮긴다.
	 *
	 * <p>AI 는 축 점수를 session_participant_analyses.axes_json 으로 보내고, 성장 지표는
	 * session_reports 의 aiXxxScore 칼럼을 읽는다(CompletedReportMetricRepository).
	 * 두 경로가 연결돼 있지 않아 그 칼럼이 계속 NULL 이었다.
	 *
	 * <p>여기서 옮기는 이유는 리포트 행의 존재가 보장되는 유일한 지점이기 때문이다 —
	 * 분석 수신 시점에는 행이 아직 없을 수 있다(REPORT_NOT_PREPARED).
	 *
	 * <p>실패해도 리포트 수신을 막지 않는다. 점수는 부가 정보이고, 여기서 예외를 던지면
	 * 이미 저장된 리포트 본문까지 롤백된다.
	 */
	private void copyAxisScores(Long sessionId, Long userId, String analysisVersion,
			SessionReport report) {
		analysisRepository.findBySessionUserAndVersion(sessionId, userId, analysisVersion)
				.ifPresent(analysis -> {
					if (analysis.getAxesJson() == null) return;
					try {
						Map<String, ReportAxisResponse> axes =
								objectMapper.readValue(analysis.getAxesJson(), AXES_TYPE);
						report.applyAxisScores(
								score(axes, "flow"), score(axes, "question"),
								score(axes, "listening"), score(axes, "reaction"),
								// balance 축이 aiMannerScore 다(ERD 명명).
								score(axes, "balance"), score(axes, "nonverbal")
						);
					} catch (JsonProcessingException exception) {
						log.warn("Axis score copy skipped. sessionId={}, userId={}, reason={}",
								sessionId, userId, exception.getMessage());
					}
				});
	}

	/** 측정 부족인 축은 null 이다 — 성장 지표가 "측정 안 됨"으로 정상 처리한다. */
	private BigDecimal score(Map<String, ReportAxisResponse> axes, String code) {
		ReportAxisResponse axis = axes.get(code);
		return axis == null ? null : axis.score();
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
