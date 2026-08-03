package com.date.backend.domain.result.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "peer_evaluations")
public class PeerEvaluation {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "peer_evaluation_id")
	private Long id;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "evaluator_user_id", nullable = false)
	private Long evaluatorUserId;

	@Column(name = "evaluatee_user_id", nullable = false)
	private Long evaluateeUserId;

	@Column(name = "comfort_score", nullable = false)
	private int comfortScore;

	@Column(name = "question_connection_score", nullable = false)
	private int questionConnectionScore;

	@Column(name = "listening_score", nullable = false)
	private int listeningScore;

	@Column(name = "reaction_score", nullable = false)
	private int reactionScore;

	@Column(name = "balance_score", nullable = false)
	private int balanceScore;

	@Column(name = "manner_score", nullable = false)
	private int mannerScore;

	@Column(name = "good_behavior_text", length = 1000)
	private String goodBehaviorText;

	@Column(name = "improvement_text", length = 1000)
	private String improvementText;

	@Column(name = "submitted_at", nullable = false)
	private LocalDateTime submittedAt;

	protected PeerEvaluation() {
	}

	public PeerEvaluation(
			Long sessionId,
			Long evaluatorUserId,
			Long evaluateeUserId,
			int comfortScore,
			int questionConnectionScore,
			int listeningScore,
			int reactionScore,
			int balanceScore,
			int mannerScore,
			String goodBehaviorText,
			String improvementText,
			LocalDateTime submittedAt
	) {
		this.sessionId = Objects.requireNonNull(sessionId);
		this.evaluatorUserId = Objects.requireNonNull(evaluatorUserId);
		this.evaluateeUserId = Objects.requireNonNull(evaluateeUserId);
		if (evaluatorUserId.equals(evaluateeUserId)) {
			throw new IllegalArgumentException("본인은 평가할 수 없습니다.");
		}
		validateScore(comfortScore);
		validateScore(questionConnectionScore);
		validateScore(listeningScore);
		validateScore(reactionScore);
		validateScore(balanceScore);
		validateScore(mannerScore);
		this.comfortScore = comfortScore;
		this.questionConnectionScore = questionConnectionScore;
		this.listeningScore = listeningScore;
		this.reactionScore = reactionScore;
		this.balanceScore = balanceScore;
		this.mannerScore = mannerScore;
		this.goodBehaviorText = trimToNull(goodBehaviorText);
		this.improvementText = trimToNull(improvementText);
		this.submittedAt = Objects.requireNonNull(submittedAt);
	}

	private static void validateScore(int score) {
		if (score < 1 || score > 5) {
			throw new IllegalArgumentException("평가 점수는 1 이상 5 이하여야 합니다.");
		}
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public Long getSessionId() {
		return sessionId;
	}

	public Long getEvaluatorUserId() {
		return evaluatorUserId;
	}

	public Long getEvaluateeUserId() {
		return evaluateeUserId;
	}

	public int getComfortScore() {
		return comfortScore;
	}

	public int getQuestionConnectionScore() {
		return questionConnectionScore;
	}

	public int getListeningScore() {
		return listeningScore;
	}

	public int getReactionScore() {
		return reactionScore;
	}

	public int getBalanceScore() {
		return balanceScore;
	}

	public int getMannerScore() {
		return mannerScore;
	}

	public String getGoodBehaviorText() {
		return goodBehaviorText;
	}

	public String getImprovementText() {
		return improvementText;
	}

	public LocalDateTime getSubmittedAt() {
		return submittedAt;
	}
}
