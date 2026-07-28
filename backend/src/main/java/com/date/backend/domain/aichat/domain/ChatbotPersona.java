package com.date.backend.domain.aichat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "chatbot_personas")
public class ChatbotPersona {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "chatbotPersonaId")
	private Long id;

	@Column(name = "name", nullable = false, length = 100)
	private String name;

	@Column(name = "speechStyle", nullable = false, length = 100)
	private String speechStyle;

	@Column(name = "difficulty", nullable = false, length = 20)
	private String difficulty;

	@Column(name = "personality", nullable = false, length = 30)
	private String personality;

	@Column(name = "reactionLevel", nullable = false, length = 20)
	private String reactionLevel;

	@Column(name = "systemPrompt", nullable = false, columnDefinition = "TEXT")
	private String systemPrompt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected ChatbotPersona() {
	}

	public ChatbotPersona(
			String name,
			String speechStyle,
			String difficulty,
			String personality,
			String reactionLevel,
			String systemPrompt
	) {
		this.name = name;
		this.speechStyle = speechStyle;
		this.difficulty = difficulty;
		this.personality = personality;
		this.reactionLevel = reactionLevel;
		this.systemPrompt = systemPrompt;
	}

	@PrePersist
	void prePersist() {
		this.createdAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}
}
