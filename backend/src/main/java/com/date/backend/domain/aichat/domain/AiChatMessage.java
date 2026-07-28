package com.date.backend.domain.aichat.domain;

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
@Table(name = "chatbot_messages")
public class AiChatMessage {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "chatbotMessageId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "chatbotConversationId", nullable = false)
	private AiChatSession session;

	@Enumerated(EnumType.STRING)
	@Column(name = "senderType", nullable = false, length = 20)
	private ChatMessageSenderType senderType;

	@Column(name = "messageText", nullable = false, columnDefinition = "TEXT")
	private String messageText;

	@Column(name = "sequenceNo", nullable = false)
	private Long sequenceNo;

	@Column(name = "isProactive", nullable = false)
	private boolean proactive;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected AiChatMessage() {
	}

	public AiChatMessage(
			AiChatSession session,
			ChatMessageSenderType senderType,
			String messageText,
			Long sequenceNo,
			boolean proactive
	) {
		this.session = session;
		this.senderType = senderType;
		this.messageText = messageText;
		this.sequenceNo = sequenceNo;
		this.proactive = proactive;
	}

	@PrePersist
	void prePersist() {
		if (createdAt == null) {
			createdAt = LocalDateTime.now();
		}
	}

	public Long getId() {
		return id;
	}

	public ChatMessageSenderType getSenderType() {
		return senderType;
	}

	public String getMessageText() {
		return messageText;
	}

	public Long getSequenceNo() {
		return sequenceNo;
	}

	public boolean isProactive() {
		return proactive;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
