package com.date.backend.domain.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "notifications")
public class Notification {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "notificationId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(name = "notificationType", nullable = false, length = 50)
	private NotificationType type;

	@Column(name = "title", nullable = false, length = 200)
	private String title;

	@Column(name = "content", nullable = false, length = 1000)
	private String content;

	@Enumerated(EnumType.STRING)
	@Column(name = "relatedType", length = 30)
	private NotificationReferenceType referenceType;

	@Column(name = "relatedId")
	private Long referenceId;

	@Enumerated(EnumType.STRING)
	@Column(name = "presentation", nullable = false, length = 30)
	private NotificationPresentation presentation;

	@Column(name = "deduplicationKey", length = 200, unique = true)
	private String deduplicationKey;

	@Column(name = "isRead", nullable = false)
	private boolean read;

	@Column(name = "sentAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "readAt")
	private LocalDateTime readAt;

	protected Notification() {
	}

	public Notification(
			Long userId,
			NotificationType type,
			String title,
			String content,
			NotificationReferenceType referenceType,
			Long referenceId,
			NotificationPresentation presentation,
			String deduplicationKey
	) {
		this.userId = Objects.requireNonNull(userId, "사용자 ID는 필수입니다.");
		this.type = Objects.requireNonNull(type, "알림 유형은 필수입니다.");
		this.title = normalizeRequired(title, 200, "알림 제목");
		this.content = normalizeRequired(content, 1000, "알림 내용");
		validateReference(referenceType, referenceId);
		this.referenceType = referenceType;
		this.referenceId = referenceId;
		this.presentation = Objects.requireNonNull(
				presentation,
				"알림 표시 방식은 필수입니다."
		);
		this.deduplicationKey = normalizeOptional(
				deduplicationKey,
				200,
				"중복 방지 키"
		);
	}

	public void read(LocalDateTime readAt) {
		if (read) {
			return;
		}
		this.read = true;
		this.readAt = Objects.requireNonNull(readAt, "읽음 시각은 필수입니다.");
	}

	@PrePersist
	void prePersist() {
		if (createdAt == null) {
			createdAt = LocalDateTime.now();
		}
	}

	private static void validateReference(
			NotificationReferenceType referenceType,
			Long referenceId
	) {
		if ((referenceType == null) != (referenceId == null)) {
			throw new IllegalArgumentException(
					"참조 유형과 참조 ID는 함께 입력해야 합니다."
			);
		}
	}

	private static String normalizeRequired(String value, int maxLength, String label) {
		String normalized = Objects.requireNonNull(value, label + "은 필수입니다.").strip();
		if (normalized.isEmpty() || normalized.length() > maxLength) {
			throw new IllegalArgumentException(
					label + "은 1자 이상 " + maxLength + "자 이하여야 합니다."
			);
		}
		return normalized;
	}

	private static String normalizeOptional(String value, int maxLength, String label) {
		if (value == null) {
			return null;
		}
		String normalized = value.strip();
		if (normalized.isEmpty() || normalized.length() > maxLength) {
			throw new IllegalArgumentException(
					label + "는 1자 이상 " + maxLength + "자 이하여야 합니다."
			);
		}
		return normalized;
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public NotificationType getType() {
		return type;
	}

	public String getTitle() {
		return title;
	}

	public String getContent() {
		return content;
	}

	public NotificationReferenceType getReferenceType() {
		return referenceType;
	}

	public Long getReferenceId() {
		return referenceId;
	}

	public NotificationPresentation getPresentation() {
		return presentation;
	}

	public String getDeduplicationKey() {
		return deduplicationKey;
	}

	public boolean isRead() {
		return read;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getReadAt() {
		return readAt;
	}
}
