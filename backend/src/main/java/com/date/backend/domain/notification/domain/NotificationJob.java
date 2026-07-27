package com.date.backend.domain.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "notification_jobs")
public class NotificationJob {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "notificationJobId")
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

	@Column(name = "deduplicationKey", nullable = false, length = 200, unique = true)
	private String deduplicationKey;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private NotificationJobStatus status = NotificationJobStatus.PENDING;

	@Column(name = "scheduledAt", nullable = false)
	private LocalDateTime scheduledAt;

	@Column(name = "availableAt", nullable = false)
	private LocalDateTime availableAt;

	@Column(name = "attemptCount", nullable = false)
	private int attemptCount;

	@Column(name = "claimedAt")
	private LocalDateTime claimedAt;

	@Column(name = "completedAt")
	private LocalDateTime completedAt;

	@Column(name = "cancelledAt")
	private LocalDateTime cancelledAt;

	@Column(name = "failedAt")
	private LocalDateTime failedAt;

	@Column(name = "workerId", length = 100)
	private String workerId;

	@Column(name = "lastError", length = 1000)
	private String lastError;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected NotificationJob() {
	}

	public NotificationJob(
			Long userId,
			NotificationType type,
			String title,
			String content,
			NotificationReferenceType referenceType,
			Long referenceId,
			NotificationPresentation presentation,
			String deduplicationKey,
			LocalDateTime scheduledAt
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
		this.deduplicationKey = normalizeRequired(
				deduplicationKey,
				200,
				"중복 방지 키"
		);
		this.scheduledAt = Objects.requireNonNull(
				scheduledAt,
				"예약 시각은 필수입니다."
		);
		this.availableAt = scheduledAt;
	}

	public void claim(String workerId, LocalDateTime claimedAt) {
		requireStatus(NotificationJobStatus.PENDING);
		this.status = NotificationJobStatus.PROCESSING;
		this.workerId = normalizeRequired(workerId, 100, "Worker ID");
		this.claimedAt = Objects.requireNonNull(claimedAt, "점유 시각은 필수입니다.");
		this.attemptCount++;
	}

	public void complete(LocalDateTime completedAt) {
		requireStatus(NotificationJobStatus.PROCESSING);
		this.status = NotificationJobStatus.COMPLETED;
		this.completedAt = Objects.requireNonNull(completedAt, "완료 시각은 필수입니다.");
		this.lastError = null;
	}

	public void reschedule(String error, LocalDateTime availableAt) {
		requireStatus(NotificationJobStatus.PROCESSING);
		this.status = NotificationJobStatus.PENDING;
		this.availableAt = Objects.requireNonNull(
				availableAt,
				"재시도 가능 시각은 필수입니다."
		);
		this.claimedAt = null;
		this.workerId = null;
		this.lastError = normalizeError(error);
	}

	public void fail(String error, LocalDateTime failedAt) {
		requireStatus(NotificationJobStatus.PROCESSING);
		this.status = NotificationJobStatus.FAILED;
		this.failedAt = Objects.requireNonNull(failedAt, "실패 시각은 필수입니다.");
		this.lastError = normalizeError(error);
	}

	public void cancel(LocalDateTime cancelledAt) {
		if (status != NotificationJobStatus.PENDING) {
			throw new IllegalStateException("대기 중인 알림 작업만 취소할 수 있습니다.");
		}
		this.status = NotificationJobStatus.CANCELLED;
		this.cancelledAt = Objects.requireNonNull(
				cancelledAt,
				"취소 시각은 필수입니다."
		);
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	private void requireStatus(NotificationJobStatus expected) {
		if (status != expected) {
			throw new IllegalStateException(
					expected + " 상태의 알림 작업만 처리할 수 있습니다."
			);
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

	private static String normalizeError(String error) {
		if (error == null || error.isBlank()) {
			return "원인을 알 수 없는 알림 작업 오류";
		}
		String normalized = error.strip();
		return normalized.length() <= 1000
				? normalized
				: normalized.substring(0, 1000);
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

	public NotificationJobStatus getStatus() {
		return status;
	}

	public LocalDateTime getScheduledAt() {
		return scheduledAt;
	}

	public LocalDateTime getAvailableAt() {
		return availableAt;
	}

	public int getAttemptCount() {
		return attemptCount;
	}

	public LocalDateTime getClaimedAt() {
		return claimedAt;
	}

	public LocalDateTime getCompletedAt() {
		return completedAt;
	}

	public LocalDateTime getCancelledAt() {
		return cancelledAt;
	}

	public LocalDateTime getFailedAt() {
		return failedAt;
	}

	public String getWorkerId() {
		return workerId;
	}

	public String getLastError() {
		return lastError;
	}
}
