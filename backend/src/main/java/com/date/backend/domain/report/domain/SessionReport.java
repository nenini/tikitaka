package com.date.backend.domain.report.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Entity
@Table(name = "session_reports", uniqueConstraints =
		@UniqueConstraint(name = "UK_session_reports_session_user", columnNames = {"sessionId", "userId"}))
public class SessionReport {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "sessionReportId") private Long id;
	@Column(name = "sessionId", nullable = false) private Long sessionId;
	@Column(name = "userId", nullable = false) private Long userId;
	@Enumerated(EnumType.STRING)
	@Column(name = "reportStatus", nullable = false, length = 20) private SessionReportStatus status;
	@Column(name = "analysisVersion", length = 50) private String analysisVersion;
	@Column(name = "reportVersion", length = 50) private String reportVersion;
	@Enumerated(EnumType.STRING)
	@Column(name = "generationMode", length = 20) private ReportGenerationMode generationMode;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "strengthsJson", columnDefinition = "json") private List<String> strengths;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "improvementsJson", columnDefinition = "json") private List<String> improvements;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "nextMissionsJson", columnDefinition = "json") private List<String> nextMissions;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "topicSummaryJson", columnDefinition = "json") private String topicSummaryJson;
	@Column(name = "summaryText", columnDefinition = "TEXT") private String summaryText;

	// 6축 점수. AI 는 session_participant_analyses.axes_json 에 보내고, 성장 지표는
	// 여기를 읽는다(CompletedReportMetricRepository). 두 곳이 연결돼 있지 않아 계속
	// NULL 이었다 — 리포트 결과 수신 시점에 분석에서 옮겨 담는다.
	// balance 축이 aiMannerScore 다(ERD 명명). 나머지 다섯은 이름이 대응한다.
	@Column(name = "aiFlowScore") private BigDecimal aiFlowScore;
	@Column(name = "aiQuestionScore") private BigDecimal aiQuestionScore;
	@Column(name = "aiListeningScore") private BigDecimal aiListeningScore;
	@Column(name = "aiReactionScore") private BigDecimal aiReactionScore;
	@Column(name = "aiMannerScore") private BigDecimal aiMannerScore;
	@Column(name = "aiNonverbalScore") private BigDecimal aiNonverbalScore;
	@Column(name = "failureCode", length = 80) private String failureCode;
	@Column(name = "failureReason", length = 1000) private String failureReason;
	@Column(name = "resultPayloadHash", length = 64) private String resultPayloadHash;
	@Column(name = "requestedAt") private LocalDateTime requestedAt;
	@Column(name = "generationStartedAt") private LocalDateTime generationStartedAt;
	@Column(name = "lastAttemptAt") private LocalDateTime lastAttemptAt;
	@Column(name = "attemptCount", nullable = false) private int attemptCount;
	@Column(name = "generatedAt") private LocalDateTime generatedAt;
	@Column(name = "createdAt", nullable = false, updatable = false) private LocalDateTime createdAt;
	@Column(name = "updatedAt", nullable = false) private LocalDateTime updatedAt;

	protected SessionReport() {}

	public SessionReport(Long sessionId, Long userId, LocalDateTime requestedAt) {
		this.sessionId = Objects.requireNonNull(sessionId);
		this.userId = Objects.requireNonNull(userId);
		this.status = SessionReportStatus.PENDING;
		this.requestedAt = Objects.requireNonNull(requestedAt);
		this.createdAt = requestedAt;
		this.updatedAt = requestedAt;
	}

	public void recordAttempt(LocalDateTime attemptedAt) {
		if (status == SessionReportStatus.COMPLETED) return;
		attemptCount++;
		lastAttemptAt = attemptedAt;
		updatedAt = attemptedAt;
	}

	public void markGenerating(LocalDateTime startedAt) {
		if (status == SessionReportStatus.COMPLETED) return;
		status = SessionReportStatus.GENERATING;
		generationStartedAt = generationStartedAt == null ? startedAt : generationStartedAt;
		failureCode = null;
		failureReason = null;
		updatedAt = startedAt;
	}

	public void markRequestFailed(String failureCode, String failureReason, LocalDateTime failedAt) {
		if (status == SessionReportStatus.COMPLETED) return;
		status = SessionReportStatus.FAILED;
		generationMode = ReportGenerationMode.NONE;
		this.failureCode = requireText(failureCode);
		this.failureReason = requireText(failureReason);
		updatedAt = failedAt;
	}

	public void resetForRetry(LocalDateTime requestedAt) {
		if (status != SessionReportStatus.FAILED) {
			throw new IllegalStateException("실패한 리포트만 다시 요청할 수 있습니다.");
		}
		status = SessionReportStatus.PENDING;
		generationMode = null;
		failureCode = null;
		failureReason = null;
		resultPayloadHash = null;
		generationStartedAt = null;
		lastAttemptAt = null;
		attemptCount = 0;
		generatedAt = null;
		this.requestedAt = Objects.requireNonNull(requestedAt);
		updatedAt = requestedAt;
	}

	public boolean complete(String analysisVersion, String reportVersion, String payloadHash,
			ReportGenerationMode generationMode, String summaryText,
			List<String> strengths, List<String> improvements, List<String> nextMissions,
			String failureCode, String failureReason,
			LocalDateTime generatedAt) {
		if (status == SessionReportStatus.COMPLETED) {
			if (Objects.equals(this.reportVersion, reportVersion)
					&& Objects.equals(this.resultPayloadHash, payloadHash)) return false;
			throw new IllegalStateException("이미 다른 버전으로 완료된 리포트입니다.");
		}
		this.status = SessionReportStatus.COMPLETED;
		this.analysisVersion = requireText(analysisVersion);
		this.reportVersion = requireText(reportVersion);
		this.resultPayloadHash = requireText(payloadHash);
		this.generationMode = Objects.requireNonNull(generationMode);
		this.summaryText = requireText(summaryText);
		this.strengths = List.copyOf(strengths);
		this.improvements = List.copyOf(improvements);
		this.nextMissions = List.copyOf(nextMissions);
		this.failureCode = failureCode;
		this.failureReason = failureReason;
		this.generatedAt = Objects.requireNonNull(generatedAt);
		this.updatedAt = generatedAt;
		return true;
	}

	public boolean fail(String analysisVersion, String reportVersion, String payloadHash,
			String failureCode, String failureReason, LocalDateTime failedAt) {
		if (status == SessionReportStatus.COMPLETED) {
			throw new IllegalStateException("완료된 리포트를 실패 상태로 변경할 수 없습니다.");
		}
		if (status == SessionReportStatus.FAILED
				&& Objects.equals(this.reportVersion, reportVersion)
				&& Objects.equals(this.resultPayloadHash, payloadHash)) return false;
		this.status = SessionReportStatus.FAILED;
		this.analysisVersion = analysisVersion;
		this.reportVersion = reportVersion;
		this.resultPayloadHash = requireText(payloadHash);
		this.generationMode = ReportGenerationMode.NONE;
		this.failureCode = requireText(failureCode);
		this.failureReason = requireText(failureReason);
		this.generatedAt = failedAt;
		this.updatedAt = failedAt;
		return true;
	}

	/**
	 * 6축 점수를 분석 결과에서 옮겨 담는다. 측정 부족인 축은 null 로 남긴다.
	 *
	 * <p>성장 지표(GrowthMetricSnapshot)가 이 값을 읽는다. null 은 "측정 안 됨"으로
	 * 정상 처리되므로 비워 두는 게 0 을 넣는 것보다 맞다.
	 */
	public void applyAxisScores(BigDecimal flow, BigDecimal question, BigDecimal listening,
			BigDecimal reaction, BigDecimal balance, BigDecimal nonverbal) {
		this.aiFlowScore = flow;
		this.aiQuestionScore = question;
		this.aiListeningScore = listening;
		this.aiReactionScore = reaction;
		this.aiMannerScore = balance;
		this.aiNonverbalScore = nonverbal;
	}

	public BigDecimal getAiFlowScore() { return aiFlowScore; }
	public BigDecimal getAiQuestionScore() { return aiQuestionScore; }
	public BigDecimal getAiListeningScore() { return aiListeningScore; }
	public BigDecimal getAiReactionScore() { return aiReactionScore; }
	public BigDecimal getAiMannerScore() { return aiMannerScore; }
	public BigDecimal getAiNonverbalScore() { return aiNonverbalScore; }

	private String requireText(String value) {
		if (value == null || value.isBlank()) throw new IllegalArgumentException("필수 문자열이 비어 있습니다.");
		return value.trim();
	}

	public Long getId() { return id; }
	public Long getSessionId() { return sessionId; }
	public Long getUserId() { return userId; }
	public SessionReportStatus getStatus() { return status; }
	public String getReportVersion() { return reportVersion; }
	public int getAttemptCount() { return attemptCount; }
	public ReportGenerationMode getGenerationMode() { return generationMode; }
	public String getFailureCode() { return failureCode; }
	public String getFailureReason() { return failureReason; }
	public String getSummaryText() { return summaryText; }
	public List<String> getStrengths() { return strengths; }
	public List<String> getImprovements() { return improvements; }
	public List<String> getNextMissions() { return nextMissions; }
	public String getAnalysisVersion() { return analysisVersion; }
	public LocalDateTime getRequestedAt() { return requestedAt; }
	public LocalDateTime getGenerationStartedAt() { return generationStartedAt; }
	public LocalDateTime getGeneratedAt() { return generatedAt; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
