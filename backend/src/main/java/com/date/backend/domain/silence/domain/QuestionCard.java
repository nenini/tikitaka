package com.date.backend.domain.silence.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "question_cards")
public class QuestionCard {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "question_card_id")
	private Long id;

	@Column(name = "code", nullable = false, unique = true, length = 50)
	private String code;

	@Column(name = "category", nullable = false, length = 40)
	private String category;

	@Column(name = "content", nullable = false, length = 300)
	private String content;

	@Column(name = "sensitive", nullable = false)
	private boolean sensitive;

	@Column(name = "active", nullable = false)
	private boolean active;

	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	protected QuestionCard() {
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getCategory() {
		return category;
	}

	public String getContent() {
		return content;
	}
}
