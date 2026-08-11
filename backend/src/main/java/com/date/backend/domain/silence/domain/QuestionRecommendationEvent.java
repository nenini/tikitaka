package com.date.backend.domain.silence.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Entity
@Table(name = "question_recommendation_events")
public class QuestionRecommendationEvent {
	@Id
	@Column(name = "event_id", length = 100)
	private String eventId;

	@Column(name = "session_id", nullable = false)
	private Long sessionId;

	@Column(name = "target_user_id", nullable = false)
	private Long targetUserId;

	@Column(name = "deduplication_key", nullable = false, unique = true, length = 255)
	private String deduplicationKey;

	@Column(name = "triggered_elapsed_ms", nullable = false)
	private long triggeredElapsedMs;

	@Column(name = "expires_elapsed_ms", nullable = false)
	private long expiresElapsedMs;

	@Enumerated(EnumType.STRING)
	@Column(name = "delivery_status", nullable = false, length = 20)
	private QuestionRecommendationStatus deliveryStatus;

	@Column(name = "source", nullable = false, length = 80)
	private String source;

	@Column(name = "version", nullable = false)
	private int version;

	@Column(name = "context_summary", length = 1000)
	private String contextSummary;

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "received_at", nullable = false)
	private LocalDateTime receivedAt;

	@Column(name = "delivered_at")
	private LocalDateTime deliveredAt;

	@OneToMany(
			mappedBy = "event",
			cascade = CascadeType.ALL,
			orphanRemoval = true,
			fetch = FetchType.LAZY
	)
	private List<QuestionRecommendationItem> items = new ArrayList<>();

	protected QuestionRecommendationEvent() {
	}

	public QuestionRecommendationEvent(
			String eventId,
			Long sessionId,
			Long targetUserId,
			String deduplicationKey,
			long triggeredElapsedMs,
			long expiresElapsedMs,
			QuestionRecommendationStatus deliveryStatus,
			String source,
			int version,
			String contextSummary,
			LocalDateTime occurredAt,
			LocalDateTime receivedAt,
			List<String> questions
	) {
		if (eventId == null || eventId.isBlank()
				|| deduplicationKey == null || deduplicationKey.isBlank()
				|| source == null || source.isBlank()) {
			throw new IllegalArgumentException("질문 추천 식별값은 필수입니다.");
		}
		if (version <= 0 || triggeredElapsedMs < 0
				|| expiresElapsedMs < triggeredElapsedMs) {
			throw new IllegalArgumentException("질문 추천 시간이 올바르지 않습니다.");
		}
		if (questions == null || questions.size() != 3
				|| questions.stream().anyMatch(
						question -> question == null || question.isBlank()
				)) {
			throw new IllegalArgumentException("맥락 질문은 정확히 3개여야 합니다.");
		}
		this.eventId = eventId.trim();
		this.sessionId = Objects.requireNonNull(sessionId);
		this.targetUserId = Objects.requireNonNull(targetUserId);
		this.deduplicationKey = deduplicationKey.trim();
		this.triggeredElapsedMs = triggeredElapsedMs;
		this.expiresElapsedMs = expiresElapsedMs;
		this.deliveryStatus = Objects.requireNonNull(deliveryStatus);
		this.source = source.trim();
		this.version = version;
		this.contextSummary = trimToNull(contextSummary);
		this.occurredAt = Objects.requireNonNull(occurredAt);
		this.receivedAt = Objects.requireNonNull(receivedAt);
		this.deliveredAt = deliveryStatus == QuestionRecommendationStatus.DELIVERED
				? receivedAt
				: null;
		for (int index = 0; index < questions.size(); index++) {
			items.add(new QuestionRecommendationItem(
					this,
					index + 1,
					questions.get(index).trim()
			));
		}
	}

	private String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public List<QuestionRecommendationItem> getItems() {
		return Collections.unmodifiableList(items);
	}
}
