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

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "chatbotPersonaId")
	private ChatbotPersona persona;

	@Column(name = "aiPersonaKey", length = 100)
	private String aiPersonaKey;

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

	@Enumerated(EnumType.STRING)
	@Column(name = "aiResponseState", nullable = false, length = 20)
	private AiResponseState aiResponseState = AiResponseState.IDLE;

	@Column(name = "pendingUserMessageId")
	private Long pendingUserMessageId;

	@Column(name = "lastAiResponseErrorCode", length = 100)
	private String lastAiResponseErrorCode;

	protected AiChatSession() {
	}

	public AiChatSession(User user, ChatbotPersona persona, ChatSessionPurpose purpose) {
		this.user = user;
		this.persona = persona;
		this.purpose = purpose;
		this.stage = ConversationStage.INTRO;
		this.status = ChatSessionStatus.ACTIVE;
	}

	public AiChatSession(User user, ChatSessionPurpose purpose) {
		this.user = user;
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

	public String getAiPersonaKey() {
		return aiPersonaKey;
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

	public LocalDateTime getLastUserMessageAt() {
		return lastUserMessageAt;
	}

	public AiResponseState getAiResponseState() {
		return aiResponseState;
	}

	public Long getPendingUserMessageId() {
		return pendingUserMessageId;
	}

	public String getLastAiResponseErrorCode() {
		return lastAiResponseErrorCode;
	}

	public void recordUserMessage(LocalDateTime sentAt) {
		this.lastUserMessageAt = sentAt;
	}

	public void selectAiPersona(String aiPersonaKey) {
		if (aiPersonaKey == null || aiPersonaKey.isBlank()) {
			throw new IllegalArgumentException("AI persona key must not be blank.");
		}
		if (this.aiPersonaKey != null && !this.aiPersonaKey.equals(aiPersonaKey)) {
			throw new IllegalStateException("AI persona cannot be changed within a chat session.");
		}
		this.aiPersonaKey = aiPersonaKey;
	}

	public void startAiResponse(Long userMessageId) {
		if (aiResponseState == AiResponseState.PROCESSING) {
			throw new IllegalStateException("AI response is already processing.");
		}
		this.aiResponseState = AiResponseState.PROCESSING;
		this.pendingUserMessageId = userMessageId;
		this.lastAiResponseErrorCode = null;
	}

	public void completeAiResponse(Long userMessageId) {
		if (!matchesPendingMessage(userMessageId)) {
			return;
		}
		this.aiResponseState = AiResponseState.IDLE;
		this.pendingUserMessageId = null;
		this.lastAiResponseErrorCode = null;
	}

	public void failAiResponse(Long userMessageId, String errorCode) {
		if (aiResponseState != AiResponseState.PROCESSING || !matchesPendingMessage(userMessageId)) {
			return;
		}
		this.aiResponseState = AiResponseState.FAILED;
		this.lastAiResponseErrorCode = errorCode;
	}

	public void cancelAiResponse(Long userMessageId) {
		if (!matchesPendingMessage(userMessageId)) {
			return;
		}
		this.aiResponseState = AiResponseState.CANCELLED;
		this.lastAiResponseErrorCode = "AI_RESPONSE_CANCELLED";
	}

	private boolean matchesPendingMessage(Long userMessageId) {
		return pendingUserMessageId != null && pendingUserMessageId.equals(userMessageId);
	}

	public void close(LocalDateTime closedAt) {
		if (status != ChatSessionStatus.ACTIVE) {
			return;
		}
		this.status = ChatSessionStatus.COMPLETED;
		this.closedAt = closedAt;
	}
}
