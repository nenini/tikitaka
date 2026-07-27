package com.date.backend.domain.aichat.domain;

import com.date.backend.domain.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "chatbot_conversations")
public class AiChatSession {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "chatbotConversationId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "userId", nullable = false)
	private User user;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "chatbotPersonaId", nullable = false)
	private ChatbotPersona persona;

	@Enumerated(EnumType.STRING)
	@Column(name = "purpose", nullable = false, length = 30)
	private ChatSessionPurpose purpose;

	@Enumerated(EnumType.STRING)
	@Column(name = "conversationStage", nullable = false, length = 20)
	private ConversationStage stage;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private ChatSessionStatus status;

	@Column(name = "lastUserMessageAt")
	private LocalDateTime lastUserMessageAt;

	@Column(name = "proactiveMessageSentAt")
	private LocalDateTime proactiveMessageSentAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "closedAt")
	private LocalDateTime closedAt;

	protected AiChatSession() {
	}

	public AiChatSession(User user, ChatbotPersona persona, ChatSessionPurpose purpose) {
		this.user = user;
		this.persona = persona;
		this.purpose = purpose;
		this.stage = ConversationStage.INTRO;
		this.status = ChatSessionStatus.ACTIVE;
	}

	@PrePersist
	void prePersist() {
		this.createdAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public User getUser() {
		return user;
	}

	public ChatbotPersona getPersona() {
		return persona;
	}

	public ChatSessionPurpose getPurpose() {
		return purpose;
	}

	public ConversationStage getStage() {
		return stage;
	}

	public ChatSessionStatus getStatus() {
		return status;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getClosedAt() {
		return closedAt;
	}

	public void recordUserMessage(LocalDateTime sentAt) {
		this.lastUserMessageAt = sentAt;
	}

	public void close(LocalDateTime closedAt) {
		if (status != ChatSessionStatus.ACTIVE) {
			return;
		}
		this.status = ChatSessionStatus.COMPLETED;
		this.closedAt = closedAt;
	}
}
