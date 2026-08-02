package com.date.backend.domain.silence.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.Objects;

@Entity
@Table(name = "question_recommendation_items")
public class QuestionRecommendationItem {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "question_recommendation_item_id")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "event_id", nullable = false)
	private QuestionRecommendationEvent event;

	@Column(name = "sequence_no", nullable = false)
	private int sequenceNo;

	@Column(name = "content", nullable = false, length = 500)
	private String content;

	protected QuestionRecommendationItem() {
	}

	QuestionRecommendationItem(
			QuestionRecommendationEvent event,
			int sequenceNo,
			String content
	) {
		this.event = Objects.requireNonNull(event);
		this.sequenceNo = sequenceNo;
		this.content = Objects.requireNonNull(content);
	}

	public int getSequenceNo() {
		return sequenceNo;
	}

	public String getContent() {
		return content;
	}
}
